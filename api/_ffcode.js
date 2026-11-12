// Friends and family codes (user, Nov 12, 2026). Every Legacy Club member makes one personal code of their own
// choosing (account page). Whoever enters it at checkout gets 5% off the order. Rules from the user:
//   - good for 10 orders; after that the member reaches out to GDE, which clears it (app, /api/admin ffcode-reset)
//     so they can make a new one
//   - never combined with a club discount: a buyer already in a club keeps their own discount and the code isn't used
//   - the buyer's guns don't count toward the member (the member is already at the top tier)
// A use is an order that carries the code and is paid, or still waiting for payment (so 10 checkouts at once can't
// all slip through); unpaid ones stop counting once the app marks them not paid.
// Stored next to the orders (see _store.js):
//   gde:ffcode:<CODE>   { code, email, createdAt, active, clearedAt }
//   gde:ffowner:<email> the member's active code
const store = require("./_store");
const { collectorStatus } = require("./_collector");

const PERCENT = 5;
const USES = 10;
const CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,18}[A-Z0-9]$/;
const RESERVED = /^(GDE|ADMIN|TEST|FREE|DISCOUNT|COLLECTOR|LEGACY)$/;

const norm = (email) => String(email || "").trim().toLowerCase();
const cleanCode = (code) => String(code || "").trim().toUpperCase().replace(/\s+/g, "");
const parse = (value) => { try { return value ? JSON.parse(value) : null; } catch { return null; } };
const environment = () => (process.env.AUTHORIZE_ENV === "production" ? "production" : "sandbox");

function usesOf(code, orders) {
  const env = environment();
  return orders.filter((o) => o.ffCode === code && (o.environment || "sandbox") === env && ["paid", "awaiting_payment"].includes(o.status)).length;
}

// The member's code and how much is left, or null.
async function codeFor(email, orders) {
  const code = await store.cmd("GET", `gde:ffowner:${norm(email)}`);
  if (!code) return null;
  const used = usesOf(code, orders || (await store.listOrders()));
  return { code, uses: used, usesLeft: Math.max(0, USES - used), limit: USES, percent: PERCENT };
}

async function createCode(email, wanted) {
  email = norm(email);
  const code = cleanCode(wanted);
  const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
  const status = await collectorStatus(email);
  if (status.tier !== "legacy") fail("Friends and family codes are for Legacy Club members.", 403);
  if (await store.cmd("GET", `gde:ffowner:${email}`)) fail("You already have a code. Contact us when it runs out and we'll set you up with a new one.", 409);
  if (!CODE_RE.test(code)) fail("Use 4 to 20 letters or numbers (dashes are fine in the middle).");
  if (RESERVED.test(code)) fail("That code is reserved. Try another one.");
  const record = { code, email, createdAt: new Date().toISOString(), active: true };
  // SET NX: a code name is never handed out twice, not even after it's cleared.
  const ok = await store.cmd("SET", `gde:ffcode:${code}`, JSON.stringify(record), "NX");
  if (!ok) fail("That code is taken. Try another one.", 409);
  await store.cmd("SET", `gde:ffowner:${email}`, code);
  return { code, uses: 0, usesLeft: USES, limit: USES, percent: PERCENT };
}

// Is this code good for this buyer right now? { ok, code, percent, usesLeft, owner } or { ok: false, error }.
async function checkCode(wanted, buyerEmail, orders) {
  const code = cleanCode(wanted);
  const no = (error) => ({ ok: false, error });
  if (!CODE_RE.test(code)) return no("That code isn't valid.");
  const record = parse(await store.cmd("GET", `gde:ffcode:${code}`));
  if (!record || !record.active) return no("That code isn't valid.");
  if (buyerEmail && norm(buyerEmail) === record.email) return no("This is your own code. It's for your friends and family; your Legacy Club discount already applies to you.");
  orders = orders || (await store.listOrders());
  const used = usesOf(code, orders);
  if (used >= USES) return no("This code has been used all 10 times. Ask the person who gave it to you for a new one.");
  const owner = await collectorStatus(record.email, orders);
  if (owner.tier !== "legacy") return no("That code isn't valid.");
  return { ok: true, code, percent: PERCENT, usesLeft: USES - used, owner: record.email };
}

// GDE clears a member's code (used up, or on request) so they can make a new one. The old name stays taken.
async function clearCode(email) {
  email = norm(email);
  const code = await store.cmd("GET", `gde:ffowner:${email}`);
  if (!code) return null;
  const record = parse(await store.cmd("GET", `gde:ffcode:${code}`)) || { code, email };
  Object.assign(record, { active: false, clearedAt: new Date().toISOString() });
  await store.pipeline([["SET", `gde:ffcode:${code}`, JSON.stringify(record)], ["DEL", `gde:ffowner:${email}`]]);
  return code;
}

module.exports = { PERCENT, USES, cleanCode, codeFor, createCode, checkCode, clearCode, usesOf };
