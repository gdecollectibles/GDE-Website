// The buyer's order confirmation email (user, Nov 19, 2026), sent once per paid order through _mail.js.
// Two ways in, whichever comes first:
//   - order-confirm.js: the checkout page calls it the moment Authorize.net says the card was approved
//   - admin.js refreshPayments: the app's order check every few minutes (covers the full-page payment form too)
// A Redis lock (gde:order-confirm:<invoice>) makes sure two of them at once still send one email. The order keeps
// confirmationSentAt (or confirmationError, retried on the next check).
const store = require("./_store");
const mail = require("./_mail");

// Orders made before the email went live (Nov 19, 2026, 11 AM Eastern) never get one.
const CONFIRM_FROM = Date.parse("2026-11-19T16:00:00Z");

async function confirmOrder(order) {
  if (!order || order.status !== "paid" || order.confirmationSentAt || !mail.configured()) return false;
  if (!(Date.parse(order.createdAt) >= CONFIRM_FROM)) return false;
  const to = String(order.form?.email || "").trim();
  if (!to) return false;
  const lock = `gde:order-confirm:${order.invoice}`;
  if ((await store.cmd("SET", lock, new Date().toISOString(), "NX", "EX", 600)) !== "OK") return false;
  try {
    // Another call may have sent it and saved the order since this copy was read.
    const latest = JSON.parse((await store.cmd("GET", `gde:order:${order.invoice}`)) || "null");
    if (latest?.confirmationSentAt) { order.confirmationSentAt = latest.confirmationSentAt; return false; }
    await mail.sendOrderConfirmation(to, order);
    Object.assign(order, latest ? { ...latest, status: order.status, payment: order.payment || latest.payment } : {});
    order.confirmationSentAt = new Date().toISOString();
    delete order.confirmationError;
    await store.cmd("SET", `gde:order:${order.invoice}`, JSON.stringify(order));
    return true;
  } catch (error) {
    order.confirmationError = String(error.message || error).slice(0, 300);
    try { await store.cmd("SET", `gde:order:${order.invoice}`, JSON.stringify(order)); } catch {}
    await store.cmd("DEL", lock).catch(() => {});
    throw error;
  }
}

module.exports = { confirmOrder };
