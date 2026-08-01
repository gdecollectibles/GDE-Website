const fs = require("node:fs");
const path = require("node:path");

const AUTHORIZE_ENDPOINTS = {
  sandbox: "https://apitest.authorize.net/xml/v1/request.api",
  production: "https://api.authorize.net/xml/v1/request.api"
};

function readInventory() {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "codex-inventory.json"), "utf8")).products;
}

function priceNumber(value) {
  return Number(String(value).replace(/[$,]/g, ""));
}

function cleanText(value, maxLength = 255) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
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
    const inventory = readInventory();
    const cart = [...new Set(Array.isArray(body.cart) ? body.cart : [])]
      .filter(id => inventory[id] && !inventory[id].availability.includes("Archive"));

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
    const invoiceNumber = `GDE-${Date.now().toString().slice(-10)}`;
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
          setting: [
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
