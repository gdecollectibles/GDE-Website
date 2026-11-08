const fs = require("node:fs");
const path = require("node:path");
const store = require("./_store");

const AUTHORIZE_ENDPOINTS = {
  sandbox: "https://apitest.authorize.net/xml/v1/request.api",
  production: "https://api.authorize.net/xml/v1/request.api"
};
const CHECKOUT_FORMSPREE_URL = "https://formspree.io/f/mrenwyyv";

function readInventory() {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "codex-inventory.json"), "utf8")).products;
}

// The listings with the prices and sold-out flags the inventory app last sent (the built-in ones if it never has).
async function liveInventory() {
  const inventory = readInventory();
  let catalog = null;
  try { catalog = await store.getCatalog(); } catch (error) { console.error(error); }
  for (const [id, live] of Object.entries(catalog?.listings || {})) {
    if (!inventory[id]) continue;
    if (Number.isFinite(live.price) && live.price > 0) inventory[id].price = `$${live.price.toLocaleString("en-US")}`;
    inventory[id].soldOut = !!live.soldOut;
  }
  return inventory;
}

// Everything the buyer typed at checkout, kept for the order in the inventory app.
function cleanForm(customer) {
  const form = {};
  for (const [key, value] of Object.entries(customer || {}).slice(0, 60)) {
    if (/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(key)) form[key] = String(value ?? "").trim().slice(0, 2000);
  }
  return form;
}

function priceNumber(value) {
  return Number(String(value).replace(/[$,]/g, ""));
}

function cleanText(value, maxLength = 255) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function buildCheckoutEmailPayload({ customer, items, amount, invoiceNumber }) {
  const data = new URLSearchParams();
  data.set("subject", "New GDE Collectibles Checkout");
  data.set("invoiceNumber", invoiceNumber);
  data.set("cartTotal", `$${amount.toLocaleString()}`);
  data.set("cartItems", items.map(item => `${item.product.name} | ${item.product.platform} | ${item.product.finish} | ${item.product.price}`).join("\n"));
  for (const [key, value] of Object.entries(customer || {})) data.set(key, cleanText(value, 1000));
  data.set("complianceEligible", "Yes - checked");
  data.set("complianceFFLDealer", "Yes - checked");
  data.set("complianceBackgroundChecks", "Yes - checked");
  data.set("complianceRequestOnly", "Yes - checked");
  data.set("complianceContactPermission", "Yes - checked");
  return data;
}

async function sendCheckoutEmail(payload) {
  const response = await fetch(CHECKOUT_FORMSPREE_URL, {
    method: "POST",
    headers: { "Accept": "application/json" },
    body: payload
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || result.errors?.[0]?.message || "Checkout details could not be emailed. Please try again.");
  }
}

function siteOrigin(request) {
  const proto = request.headers["x-forwarded-proto"] || "https";
  const host = request.headers["x-forwarded-host"] || request.headers.host;
  return process.env.SITE_URL || `${Array.isArray(proto) ? proto[0] : proto}://${Array.isArray(host) ? host[0] : host}`;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", chunk => {
      body += chunk;
      if (body.length > 100000) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON request."));
      }
    });
    request.on("error", reject);
  });
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Use POST to create a payment session." });
  }

  const loginId = process.env.AUTHORIZE_LOGIN_ID;
  const transactionKey = process.env.AUTHORIZE_TRANSACTION_KEY;
  const environment = process.env.AUTHORIZE_ENV === "production" ? "production" : "sandbox";

  if (!loginId || !transactionKey) {
    return response.status(500).json({ error: "Authorize.net credentials are not configured in Vercel." });
  }

  try {
    const body = await readBody(request);
    const inventory = await liveInventory();
    const cart = [...new Set(Array.isArray(body.cart) ? body.cart : [])]
      .filter(id => inventory[id] && !inventory[id].availability.includes("Archive"));
    const soldOut = cart.filter(id => inventory[id].soldOut);
    if (soldOut.length) {
      return response.status(409).json({ error: `Sorry, ${soldOut.map(id => inventory[id].name).join(" and ")} just sold out. Please remove it from your cart.` });
    }

    if (!cart.length) {
      return response.status(400).json({ error: "No valid cart items were provided." });
    }

    const items = cart.map(id => ({ id, product: inventory[id], unitPrice: priceNumber(inventory[id].price) }));
    const amount = items.reduce((sum, item) => sum + item.unitPrice, 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return response.status(400).json({ error: "The cart total could not be calculated." });
    }

    const origin = siteOrigin(request);
    const customer = body.customer || {};
    const embedded = body.embedded === true;
    const invoiceNumber = `GDE-${Date.now().toString().slice(-10)}`;
    await sendCheckoutEmail(buildCheckoutEmailPayload({ customer, items, amount, invoiceNumber }));
    // Saved for the inventory app, which checks the payment and files the buyer. A store hiccup never blocks the sale:
    // the email above still has every detail.
    const order = {
      invoice: invoiceNumber,
      createdAt: new Date().toISOString(),
      status: "awaiting_payment",
      environment,
      amount,
      items: items.map(item => ({ listing: item.id, name: item.product.name, price: item.unitPrice })),
      form: cleanForm(customer)
    };
    const saveOrder = async (changes, isNew) => {
      if (!store.configured()) return;
      try { await store.saveOrder(Object.assign(order, changes), isNew); } catch (error) { console.error(error); }
    };
    await saveOrder({}, true);
    const authorizeRequest = {
      getHostedPaymentPageRequest: {
        merchantAuthentication: { name: loginId, transactionKey },
        transactionRequest: {
          transactionType: "authCaptureTransaction",
          amount: amount.toFixed(2),
          order: {
            invoiceNumber,
            description: `GDE Collectibles order: ${items.map(item => item.product.name).join(", ")}`.slice(0, 255)
          },
          lineItems: {
            lineItem: items.map(item => ({
              itemId: cleanText(item.id, 31),
              name: cleanText(item.product.name, 31),
              description: cleanText(`${item.product.platform} ${item.product.finish}`, 255),
              quantity: "1",
              unitPrice: item.unitPrice.toFixed(2)
            }))
          },
          customer: { email: cleanText(customer.email, 255) },
          billTo: {
            firstName: cleanText(customer.firstName, 50),
            lastName: cleanText(customer.lastName, 50),
            address: cleanText(customer.address, 60),
            city: cleanText(customer.city, 40),
            state: cleanText(customer.state, 40),
            zip: cleanText(customer.zip, 20),
            phoneNumber: cleanText(customer.phone, 25)
          }
        },
        hostedPaymentSettings: {
          // Embedded (the checkout page shows Authorize.net's form in a frame): only the card fields show, since the
          // page already has the buyer's details and order (they are still sent above, for the address check and receipt);
          // the result comes back through iframe-communicator.html. Otherwise the full page opens on its own, as before.
          setting: embedded ? [
            {
              settingName: "hostedPaymentReturnOptions",
              settingValue: JSON.stringify({ showReceipt: false, url: `${origin}/payment-success.html`, urlText: "Continue", cancelUrl: `${origin}/payment-cancel.html`, cancelUrlText: "Cancel" })
            },
            { settingName: "hostedPaymentIFrameCommunicatorUrl", settingValue: JSON.stringify({ url: `${origin}/iframe-communicator.html` }) },
            { settingName: "hostedPaymentButtonOptions", settingValue: JSON.stringify({ text: `Pay $${amount.toLocaleString("en-US")}` }) },
            { settingName: "hostedPaymentStyleOptions", settingValue: JSON.stringify({ bgColor: "#0a0a0a" }) },
            { settingName: "hostedPaymentOrderOptions", settingValue: JSON.stringify({ show: false, merchantName: "GDE Collectibles" }) },
            { settingName: "hostedPaymentBillingAddressOptions", settingValue: JSON.stringify({ show: false, required: false }) },
            { settingName: "hostedPaymentCustomerOptions", settingValue: JSON.stringify({ showEmail: false, requiredEmail: false }) },
            { settingName: "hostedPaymentSecurityOptions", settingValue: JSON.stringify({ captcha: false }) }
          ] : [
            {
              settingName: "hostedPaymentReturnOptions",
              settingValue: JSON.stringify({
                showReceipt: true,
                url: `${origin}/payment-success.html`,
                urlText: "Return to GDE Collectibles",
                cancelUrl: `${origin}/payment-cancel.html`,
                cancelUrlText: "Cancel payment"
              })
            },
            { settingName: "hostedPaymentButtonOptions", settingValue: JSON.stringify({ text: "Pay" }) },
            { settingName: "hostedPaymentBillingAddressOptions", settingValue: JSON.stringify({ show: true, required: false }) },
            { settingName: "hostedPaymentCustomerOptions", settingValue: JSON.stringify({ showEmail: true, requiredEmail: true }) },
            { settingName: "hostedPaymentSecurityOptions", settingValue: JSON.stringify({ captcha: false }) }
          ]
        }
      }
    };

    const authorizeResponse = await fetch(AUTHORIZE_ENDPOINTS[environment], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(authorizeRequest)
    });
    const result = await authorizeResponse.json();
    const messages = result?.messages;

    if (!authorizeResponse.ok || messages?.resultCode !== "Ok" || !result.token) {
      const errorText = messages?.message?.map(message => message.text).join(" ") || "Authorize.net did not return a payment token.";
      await saveOrder({ status: "payment_error", error: errorText.slice(0, 500) });
      return response.status(502).json({ error: errorText, code: messages?.message?.[0]?.code });
    }

    return response.status(200).json({
      token: result.token,
      paymentUrl: environment === "production" ? "https://accept.authorize.net/payment/payment" : "https://test.authorize.net/payment/payment",
      amount: amount.toFixed(2),
      invoiceNumber
    });
  } catch (error) {
    return response.status(500).json({ error: error.message || "Unable to create payment session." });
  }
};
