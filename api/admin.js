// The GDE inventory app's private door into the website. Every call needs the key both sides share
// (GDE_ADMIN_KEY here in Vercel, GDE_SITE_KEY in the app's secrets). Nothing here is linked from the site.
//   GET  /api/admin?action=ping      is everything set up?
//   POST /api/admin?action=catalog   the app sends prices and sold-out flags: { listings: { <listing>: { price, soldOut } } }
//   GET  /api/admin?action=orders    every saved checkout; recent unpaid or paid ones are first checked against Authorize.net
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const store = require("./_store");

const AUTHORIZE_ENDPOINTS = {
  sandbox: "https://apitest.authorize.net/xml/v1/request.api",
  production: "https://api.authorize.net/xml/v1/request.api"
};
const RECHECK_DAYS = 8;            // how far back payments are looked up
const UNPAID_AFTER_MS = 60 * 60 * 1000; // Authorize.net's payment page expires long before this

function keyMatches(given) {
  const want = process.env.GDE_ADMIN_KEY || "";
  const a = Buffer.from(String(given || "")), b = Buffer.from(want);
  return want.length >= 24 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", chunk => {
      body += chunk;
      if (body.length > 200000) { reject(new Error("Request body is too large.")); request.destroy(); }
    });
    request.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("Invalid JSON request.")); } });
    request.on("error", reject);
  });
}

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

// Every card transaction in the last RECHECK_DAYS days: not yet settled, and settled in each daily batch.
async function recentTransactions(setup) {
  const list = [];
  const paging = { limit: "1000", offset: "1" };
  const unsettled = await authorizeCall(setup, "getUnsettledTransactionListRequest",
    { sorting: { orderBy: "submitTimeUTC", orderDescending: "true" }, paging });
  list.push(...(unsettled.transactions || []));
  const from = new Date(Date.now() - RECHECK_DAYS * 86400000).toISOString().slice(0, 19) + "Z";
  const to = new Date().toISOString().slice(0, 19) + "Z";
  const batches = await authorizeCall(setup, "getSettledBatchListRequest",
    { includeStatistics: "false", firstSettlementDate: from, lastSettlementDate: to });
  for (const batch of batches.batchList || []) {
    const settled = await authorizeCall(setup, "getTransactionListRequest",
      { batchId: batch.batchId, sorting: { orderBy: "submitTimeUTC", orderDescending: "true" }, paging });
    list.push(...(settled.transactions || []));
  }
  return list;
}

const PAID = new Set(["authorizedPendingCapture", "capturedPendingSettlement", "settledSuccessfully", "FDSPendingReview", "FDSAuthorizedPendingReview"]);
const DECLINED = new Set(["declined", "generalError", "failedReview", "settlementError", "expired"]);
const REFUNDED = new Set(["refundSettledSuccessfully", "refundPendingSettlement"]);
const VOIDED = new Set(["voided", "communicationError"]);

function paymentOf(t) {
  return {
    transId: t.transId, status: t.transactionStatus, amount: Number(t.settleAmount),
    card: [t.accountType, t.accountNumber].filter(Boolean).join(" "), at: t.submitTimeUTC || t.submitTimeLocal,
    name: [t.firstName, t.lastName].filter(Boolean).join(" ")
  };
}

// Works out each recent order's status from its transactions, matched on the invoice number.
async function refreshPayments(orders) {
  const setup = authorizeSetup();
  if (!setup.ready) return { checked: 0, note: "Authorize.net keys are not set in Vercel." };
  const cutoff = Date.now() - RECHECK_DAYS * 86400000;
  const recent = orders.filter(o => ["awaiting_payment", "not_paid", "paid", "declined"].includes(o.status)
    && Date.parse(o.createdAt) > cutoff && (o.environment || "sandbox") === setup.environment);
  if (!recent.length) return { checked: 0 };
  const byInvoice = new Map();
  for (const t of await recentTransactions(setup)) {
    if (!t.invoiceNumber) continue;
    if (!byInvoice.has(t.invoiceNumber)) byInvoice.set(t.invoiceNumber, []);
    byInvoice.get(t.invoiceNumber).push(t);
  }
  const changed = [];
  for (const order of recent) {
    const ts = byInvoice.get(order.invoice) || [];
    const paid = ts.find(t => PAID.has(t.transactionStatus));
    let next = order.status, payment = order.payment || null;
    if (ts.some(t => REFUNDED.has(t.transactionStatus))) { next = "refunded"; payment = paymentOf(paid || ts[0]); }
    else if (paid) { next = "paid"; payment = paymentOf(paid); }
    else if (ts.some(t => VOIDED.has(t.transactionStatus))) { next = "voided"; payment = paymentOf(ts[0]); }
    else if (ts.some(t => DECLINED.has(t.transactionStatus))) { next = "declined"; payment = paymentOf(ts[0]); }
    else if (Date.now() - Date.parse(order.createdAt) > UNPAID_AFTER_MS) next = "not_paid";
    if (next !== order.status || JSON.stringify(payment) !== JSON.stringify(order.payment || null)) {
      Object.assign(order, { status: next, payment, checkedAt: new Date().toISOString() });
      changed.push(order);
    }
  }
  if (changed.length) await store.pipeline(changed.map(o => ["SET", `gde:order:${o.invoice}`, JSON.stringify(o)]));
  return { checked: recent.length, changed: changed.length };
}

function cleanCatalog(body) {
  const known = JSON.parse(fs.readFileSync(path.join(process.cwd(), "codex-inventory.json"), "utf8")).products;
  const listings = {};
  for (const [key, l] of Object.entries(body?.listings || {})) {
    if (!known[key]) continue;
    const price = l?.price == null || l.price === "" ? null : Math.round(Number(l.price) * 100) / 100;
    if (price != null && !(Number.isFinite(price) && price > 0 && price < 1000000)) throw new Error(`Price for ${key} is not a number.`);
    listings[key] = { price, soldOut: !!l?.soldOut };
  }
  return { updated: new Date().toISOString(), listings };
}

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (!process.env.GDE_ADMIN_KEY) return response.status(503).json({ error: "GDE_ADMIN_KEY is not set in Vercel." });
  const given = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!keyMatches(given)) return response.status(401).json({ error: "Wrong key." });
  const action = new URL(request.url, "http://x").searchParams.get("action");
  try {
    if (action === "ping" && request.method === "GET") {
      const setup = authorizeSetup();
      return response.status(200).json({ ok: true, store: store.configured(), authorize: setup.ready, environment: setup.environment });
    }
    if (!store.configured()) return response.status(503).json({ error: "The order store is not set up in Vercel yet." });
    if (action === "catalog" && request.method === "POST") {
      const catalog = cleanCatalog(await readBody(request));
      await store.cmd("SET", "gde:catalog", JSON.stringify(catalog));
      return response.status(200).json({ ok: true, listings: Object.keys(catalog.listings).length, updated: catalog.updated });
    }
    if (action === "orders" && request.method === "GET") {
      const orders = await store.listOrders();
      let payments;
      try { payments = await refreshPayments(orders); } catch (error) { payments = { error: error.message }; }
      return response.status(200).json({ orders, payments, environment: authorizeSetup().environment });
    }
    return response.status(404).json({ error: "Unknown action." });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: error.message || "Admin request failed." });
  }
};
