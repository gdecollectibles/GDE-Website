// Authorize.net's Transaction Details API, shared by admin.js (the app's order check) and order-confirm.js (the
// checkout page's "just paid" call). Needs in Vercel: AUTHORIZE_LOGIN_ID, AUTHORIZE_TRANSACTION_KEY, AUTHORIZE_ENV.
const AUTHORIZE_ENDPOINTS = {
  sandbox: "https://apitest.authorize.net/xml/v1/request.api",
  production: "https://api.authorize.net/xml/v1/request.api"
};

function authorizeSetup() {
  const environment = process.env.AUTHORIZE_ENV === "production" ? "production" : "sandbox";
  const loginId = process.env.AUTHORIZE_LOGIN_ID, transactionKey = process.env.AUTHORIZE_TRANSACTION_KEY;
  return { environment, ready: !!(loginId && transactionKey), auth: { name: loginId, transactionKey } };
}

async function authorizeCall(setup, requestName, fields) {
  const response = await fetch(AUTHORIZE_ENDPOINTS[setup.environment], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [requestName]: { merchantAuthentication: setup.auth, ...fields } })
  });
  const result = await response.json();
  if (result?.messages?.resultCode !== "Ok") {
    const code = result?.messages?.message?.[0]?.code;
    if (code === "I00004") return result; // "no records found" is a normal answer
    throw new Error(`Authorize.net: ${result?.messages?.message?.map(m => m.text).join(" ") || response.status}`);
  }
  return result;
}

const PAID = new Set(["authorizedPendingCapture", "capturedPendingSettlement", "settledSuccessfully", "FDSPendingReview", "FDSAuthorizedPendingReview"]);

// One transaction from a transaction list, as an order keeps it.
function paymentOf(t) {
  return {
    transId: t.transId, status: t.transactionStatus, amount: Number(t.settleAmount),
    card: [t.accountType, t.accountNumber].filter(Boolean).join(" "), at: t.submitTimeUTC || t.submitTimeLocal,
    name: [t.firstName, t.lastName].filter(Boolean).join(" ")
  };
}

// The same, from getTransactionDetailsRequest (its fields are named differently).
function paymentOfDetails(t) {
  const card = t.payment?.creditCard || {};
  return {
    transId: t.transId, status: t.transactionStatus, amount: Number(t.settleAmount ?? t.authAmount),
    card: [card.cardType, card.cardNumber].filter(Boolean).join(" "), at: t.submitTimeUTC || t.submitTimeLocal,
    name: [t.billTo?.firstName, t.billTo?.lastName].filter(Boolean).join(" ")
  };
}

module.exports = { authorizeSetup, authorizeCall, PAID, paymentOf, paymentOfDetails };
