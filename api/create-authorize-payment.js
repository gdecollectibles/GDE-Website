const fs = require("node:fs");
const path = require("node:path");
const store = require("./_store");
const { readSession } = require("./_session");
const { collectorStatus, discounted } = require("./_collector");
const ffcode = require("./_ffcode");
const referral = require("./_referral");

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

function buildCheckoutEmailPayload({ customer, items, amount, invoiceNumber, discount, account, referredBy }) {
  const data = new URLSearchParams();
  data.set("subject", "New GDE Collectibles Checkout");
  data.set("invoiceNumber", invoiceNumber);
  data.set("cartTotal", `$${amount.toLocaleString()}`);
  data.set("cartItems", items.map(item => `${item.product.name} | ${item.product.platform} | ${item.product.finish} | ${item.product.price}`).join("\n"));
  if (referredBy) data.set("referredBy", `Bought through the share link of ${referredBy} (counts toward their club)`);
  if (discount) data.set("collectorDiscount", discount.type === "ffcode"
    ? `${discount.name}, ${discount.percent}% off: -$${discount.amount.toLocaleString()} (code of ${discount.owner})`
    : `${discount.name}, ${discount.percent}% off: -$${discount.amount.toLocaleString()} (${discount.guns} guns bought before, account ${account})`);
  for (const [key, value] of Object.entries(customer || {})) data.set(key, cleanText(value, 1000));
  data.set("complianceEligible", "Yes - checked");
  data.set("complianceFFLDealer", "Yes - checked");
  data.set("complianceBackgroundChecks", "Yes - checked");
  data.set("complianceRequestOnly", "Yes - checked");
  data.set("complianceContactPermission", "Yes - checked");
  return data;
}

// Formspree checks some fields itself (an "email" field must look like an email) and answers only "Validation errors",
// which stopped phone checkouts (Nov 8, 2026). The email is a backup copy for GDE: the order is saved in the store
// first, so a Formspree refusal is retried once with the flagged fields renamed, and never blocks the payment.
async function postCheckoutEmail(payload) {
  const response = await fetch(CHECKOUT_FORMSPREE_URL, {
    method: "POST",
    headers: { "Accept": "application/json" },
    body: payload
  });
  const result = await response.json().catch(() => ({}));
  if (response.ok) return null;
  const details = (result.errors || []).map(e => `${e.field || "form"}: ${e.message || e.code || "invalid"}`).join("; ");
  return { status: response.status, fields: (result.errors || []).map(e => e.field).filter(Boolean), text: [result.error, details].filter(Boolean).join(" - ") || `HTTP ${response.status}` };
}

async function sendCheckoutEmail(payload) {
  try {
    let failure = await postCheckoutEmail(payload);
    if (!failure) return null;
    console.error("Checkout email refused:", failure.text);
    if (failure.fields.length) {
      for (const field of failure.fields) {
        if (!payload.has(field)) continue;
        payload.set(`${field}Given`, payload.get(field));
        payload.delete(field);
      }
      failure = await postCheckoutEmail(payload);
      if (!failure) return null;
      console.error("Checkout email refused again:", failure.text);
    }
    return failure.text;
  } catch (error) {
    console.error("Checkout email failed:", error);
    return error.message || "network error";
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/;

// The buyer's details, trimmed, and a plain message for anything that would stop the checkout further on.
function checkCustomer(customer) {
  const clean = {};
  for (const [key, value] of Object.entries(customer || {})) clean[key] = String(value ?? "").trim();
  if (clean.email) clean.email = clean.email.replace(/\s+/g, "");
  if (!EMAIL_PATTERN.test(clean.email || "")) {
    return { error: "Please check your email address. It should look like name@example.com." };
  }
  return { customer: clean };
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

    // Collector clubs (see _collector.js): 3+ guns bought 5% off, 5+ guns 10% off, on every gun, when signed in.
    const session = readSession(request);
    let collector = null;
    if (session) {
      try { collector = await collectorStatus(session.email); } catch (error) { console.error(error); }
    }
    const isCollector = !!collector?.collector;
    // A friends and family code (5%, _ffcode.js) only when the buyer has no club discount of their own: the two never add up.
    let code = null;
    if (!isCollector && body.code) {
      code = await ffcode.checkCode(body.code, session?.email);
      if (!code.ok) return response.status(400).json({ error: code.error });
    }
    const percent = isCollector ? collector.percent : code ? code.percent : 0;
    // A friend's share link (_referral.js): no discount, but the guns also count toward the link owner's club.
    // A link that's unknown or the buyer's own is simply ignored.
    let ref = null;
    if (body.ref) {
      try { ref = await referral.ownerOf(body.ref, session?.email, body.customer?.email); } catch (error) { console.error(error); }
    }
    const items = cart.map(id => {
      const listPrice = priceNumber(inventory[id].price);
      return { id, product: inventory[id], listPrice, unitPrice: percent ? discounted(listPrice, percent) : listPrice };
    });
    const amount = Math.round(items.reduce((sum, item) => sum + item.unitPrice, 0) * 100) / 100;
    const listTotal = items.reduce((sum, item) => sum + item.listPrice, 0);
    const savedAmount = Math.round((listTotal - amount) * 100) / 100;
    const discount = isCollector
      ? { type: collector.tier, name: collector.tierName, percent: collector.percent, amount: savedAmount, guns: collector.guns }
      : code ? { type: "ffcode", name: `Friends and family code ${code.code}`, code: code.code, owner: code.owner, percent: code.percent, amount: savedAmount } : null;
    if (!Number.isFinite(amount) || amount <= 0) {
      return response.status(400).json({ error: "The cart total could not be calculated." });
    }

    const origin = siteOrigin(request);
    const checked = checkCustomer(body.customer);
    if (checked.error) return response.status(400).json({ error: checked.error });
    const customer = checked.customer;
    const embedded = body.embedded === true;
    const invoiceNumber = `GDE-${Date.now().toString().slice(-10)}`;
    // Saved for the inventory app, which checks the payment and files the buyer. A store hiccup never blocks the sale
    // while the email below still goes out with every detail.
    const order = {
      invoice: invoiceNumber,
      createdAt: new Date().toISOString(),
      status: "awaiting_payment",
      environment,
      amount,
      items: items.map(item => ({ listing: item.id, name: item.product.name, price: item.unitPrice, ...(discount ? { listPrice: item.listPrice } : {}) })),
      ...(discount ? { discount } : {}),
      ...(code ? { ffCode: code.code } : {}),
      ...(ref ? { referredBy: ref.owner, ref: ref.code } : {}),
      ...(session ? { account: session.email } : {}),
      form: cleanForm(customer)
    };
    const saveOrder = async (changes, isNew) => {
      if (!store.configured()) return false;
      try { await store.saveOrder(Object.assign(order, changes), isNew); return true; } catch (error) { console.error(error); return false; }
    };
    const saved = await saveOrder({}, true);
    const emailError = await sendCheckoutEmail(buildCheckoutEmailPayload({ customer, items, amount, invoiceNumber, discount, account: session?.email, referredBy: ref?.owner }));
    if (emailError) {
      // With no saved order the email is GDE's only copy, so stop; otherwise note it on the order and carry on.
      if (!saved) return response.status(502).json({ error: "Your checkout details could not be sent. Please try again in a minute." });
      await saveOrder({ emailError: emailError.slice(0, 300) });
    }
    const authorizeRequest = {
      getHostedPaymentPageRequest: {
        merchantAuthentication: { name: loginId, transactionKey },
        transactionRequest: {
          transactionType: "authCaptureTransaction",
          amount: amount.toFixed(2),
          order: {
            invoiceNumber,
            description: `GDE Collectibles order: ${items.map(item => item.product.name).join(", ")}${discount ? ` (${discount.name}, ${discount.percent}% off)` : ""}`.slice(0, 255)
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
      invoiceNumber,
      discount
    });
  } catch (error) {
    return response.status(500).json({ error: error.message || "Unable to create payment session." });
  }
};
