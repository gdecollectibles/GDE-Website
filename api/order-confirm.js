// POST /api/order-confirm  { invoice, transId }
// The checkout page calls this the moment Authorize.net's card form says the payment was approved, so the buyer gets
// their order confirmation email right away instead of on the app's next order check (_orderconfirm.js).
// Nothing is taken on trust from the page: the transaction is looked up at Authorize.net and must belong to this
// invoice, be paid, and be for this order's amount. Then the order is marked paid and the email goes out once.
const store = require("./_store");
const { authorizeSetup, authorizeCall, PAID, paymentOfDetails } = require("./_authorize");
const { confirmOrder } = require("./_orderconfirm");

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", chunk => {
      body += chunk;
      if (body.length > 2000) { reject(new Error("Request body is too large.")); request.destroy(); }
    });
    request.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("Invalid JSON request.")); } });
    request.on("error", reject);
  });
}

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return response.status(405).json({ error: "Use POST." });
  try {
    const body = request.body && typeof request.body === "object" ? request.body : await readBody(request);
    const invoice = String(body.invoice || ""), transId = String(body.transId || "");
    if (!/^GDE-\d{6,12}$/.test(invoice) || !/^\d{1,20}$/.test(transId) || /^0+$/.test(transId)) {
      return response.status(400).json({ error: "Missing order or payment number." });
    }
    const setup = authorizeSetup();
    if (!store.configured() || !setup.ready) return response.status(503).json({ ok: false });
    const order = JSON.parse((await store.cmd("GET", `gde:order:${invoice}`)) || "null");
    if (!order) return response.status(404).json({ error: "Order not found." });
    if (order.confirmationSentAt) return response.status(200).json({ ok: true, sent: false });
    if ((order.environment || "sandbox") !== setup.environment) return response.status(409).json({ error: "Wrong payment environment." });

    const result = await authorizeCall(setup, "getTransactionDetailsRequest", { transId });
    const t = result?.transaction;
    const paid = t && t.order?.invoiceNumber === invoice && PAID.has(t.transactionStatus)
      && Math.abs(Number(t.authAmount ?? t.settleAmount) - Number(order.amount)) < 0.01;
    if (!paid) return response.status(409).json({ error: "That payment doesn't match this order." });

    if (order.status !== "paid") {
      Object.assign(order, { status: "paid", payment: paymentOfDetails(t), checkedAt: new Date().toISOString() });
      await store.cmd("SET", `gde:order:${invoice}`, JSON.stringify(order));
    }
    const sent = await confirmOrder(order);
    return response.status(200).json({ ok: true, sent });
  } catch (error) {
    console.error("order-confirm", error);
    return response.status(500).json({ error: "Could not confirm the order." });
  }
};
