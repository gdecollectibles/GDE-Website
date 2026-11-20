// Discount codes GDE makes itself in the inventory app (user, Nov 17, 2026: "how do I set up discount codes"), for a
// newsletter, a show, or one buyer. Different from the friends and family codes Legacy members make (_ffcode.js) and
// the personal welcome codes every new sign-up gets (_welcome.js).
// Rules:
//   - a percent off (1 to 90) or a dollar amount off the order (spread over its guns by price)
//   - optional start and end, to the minute (user, Nov 17: "add time limits to the codes"), and optional number of uses
//   - never combined with a club discount or a friends and family code: a club member gets whichever saves more
//   - GDE can turn a code off and back on and change its times; a code name is never reused, not even after it's off
// A use is an order that carries the code and is paid, or still waiting for payment (same as _ffcode.js); unpaid
// ones stop counting once the app marks them not paid. Test (sandbox) orders only count while the site takes test payments.
// Stored next to the orders (see _store.js):
//   gde:promo:<CODE>  { code, kind: percent|amount, value, startsAt, endsAt (ISO times or null), maxUses (or null), note,
//                       createdAt, active, changedAt }
//   gde:promos        set of every code made
const store = require("./_store");

const CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,18}[A-Z0-9]$/;
const RESERVED = /^(GDE|ADMIN|TEST|FREE|DISCOUNT|COLLECTOR|LEGACY)$|^WELCOME-/; // WELCOME-…: the welcome codes (_welcome.js)

const cleanCode = (code) => String(code || "").trim().toUpperCase().replace(/\s+/g, "");
const parse = (value) => { try { return value ? JSON.parse(value) : null; } catch { return null; } };
const environment = () => (process.env.AUTHORIZE_ENV === "production" ? "production" : "sandbox");
const cents = (n) => Math.round(n * 100) / 100;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const ms = (iso) => (iso ? Date.parse(iso) : NaN);
const notYet = (p, now = Date.now()) => !!(p.startsAt && now < ms(p.startsAt));
const ended = (p, now = Date.now()) => !!(p.endsAt && now >= ms(p.endsAt));

// "10% off" / "$250 off"
const label = (p) => (p.kind === "amount" ? `$${Number(p.value).toLocaleString("en-US", { maximumFractionDigits: 2 })} off` : `${p.value}% off`);
// "Dec 26, 11:59 PM" in Miami time, for buyers' messages.
const when = (iso) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function usesOf(code, orders) {
  const env = environment();
  return orders.filter((o) => o.promoCode === code && (o.environment || "sandbox") === env && ["paid", "awaiting_payment"].includes(o.status)).length;
}

// Each gun's price after the code, to the cent. Percent: each gun rounded the way the checkout page rounds.
// Amount: taken off in proportion to each gun's price; the last gun takes the leftover cent.
function applyTo(prices, p) {
  if (p.kind !== "amount") return prices.map((price) => Math.round(price * (100 - p.value)) / 100);
  const total = prices.reduce((s, x) => s + x, 0);
  let left = cents(Math.min(p.value, total));
  return prices.map((price, i) => {
    const off = i === prices.length - 1 ? left : cents(p.value * price / total);
    left = cents(left - off);
    return cents(price - off);
  });
}

async function getPromo(code) { return parse(await store.cmd("GET", `gde:promo:${cleanCode(code)}`)); }

// Is this one of GDE's codes, and good right now? null = not a GDE code (try the other kinds instead).
// { ok: true, code, kind, value, label, usesLeft } or { ok: false, error }.
async function checkPromo(wanted, orders) {
  const code = cleanCode(wanted);
  if (!CODE_RE.test(code)) return null;
  const p = await getPromo(code);
  if (!p) return null;
  const no = (error) => ({ ok: false, error });
  if (!p.active) return no("That code isn't active any more.");
  if (notYet(p)) return no(`That code starts ${when(p.startsAt)} (Eastern time).`);
  if (ended(p)) return no("That code has expired.");
  let usesLeft = null;
  if (p.maxUses) {
    const used = usesOf(code, orders || (await store.listOrders()));
    if (used >= p.maxUses) return no("That code has been used up.");
    usesLeft = p.maxUses - used;
  }
  return { ok: true, code, kind: p.kind, value: p.value, label: label(p), usesLeft, endsAt: p.endsAt || null };
}

// Start and end from the app (ISO times; the app turns the owner's local date and time into one). Empty = none.
function cleanTimes(b, old = {}) {
  const pick = (k) => (k in b ? b[k] : old[k]);
  const time = (v, what) => {
    if (v == null || v === "") return null;
    const t = Date.parse(v);
    if (!Number.isFinite(t)) fail(`${what}: pick a date and time.`);
    return new Date(t).toISOString();
  };
  const startsAt = time(pick("startsAt"), "Starts"), endsAt = time(pick("endsAt"), "Ends");
  if (endsAt && "endsAt" in b && ms(endsAt) <= Date.now()) fail("The end is already past.");
  if (startsAt && endsAt && ms(endsAt) <= ms(startsAt)) fail("The end must come after the start.");
  return { startsAt, endsAt };
}

function cleanNew(b) {
  const code = cleanCode(b.code);
  if (!CODE_RE.test(code)) fail("Codes are 4 to 20 letters or numbers (dashes are fine in the middle).");
  if (RESERVED.test(code)) fail("That code is reserved. Try another one.");
  const kind = b.kind === "amount" ? "amount" : "percent";
  const value = cents(Number(b.value));
  if (kind === "percent" && !(Number.isInteger(value) && value >= 1 && value <= 90)) fail("Percent off: a whole number from 1 to 90.");
  if (kind === "amount" && !(value >= 1 && value <= 10000)) fail("Dollars off: from $1 to $10,000.");
  const maxUses = b.maxUses == null || b.maxUses === "" ? null : Math.round(Number(b.maxUses));
  if (maxUses != null && !(maxUses >= 1 && maxUses <= 100000)) fail("Number of uses: 1 or more, or leave it empty for no limit.");
  return { code, kind, value, ...cleanTimes(b), maxUses, note: String(b.note || "").trim().slice(0, 200) };
}

async function createPromo(b) {
  const record = { ...cleanNew(b), createdAt: new Date().toISOString(), active: true };
  // A Legacy member's friends and family code with the same name (even a cleared one) would clash at checkout.
  if (await store.cmd("EXISTS", `gde:ffcode:${record.code}`)) fail("A Legacy Club member already uses that code. Try another one.", 409);
  // SET NX: a code name is never handed out twice (a deleted code that buyers used keeps its name taken).
  if (!(await store.cmd("SET", `gde:promo:${record.code}`, JSON.stringify(record), "NX"))) {
    fail((await getPromo(record.code))?.deleted ? "That code was deleted after orders used it, so its name can't be used again. Try another one." : "That code already exists. Try another one.", 409);
  }
  await store.cmd("SADD", "gde:promos", record.code);
  return record;
}

// Turn a code off or back on, and/or change its start and end: { code, active?, startsAt?, endsAt? }.
async function updatePromo(b) {
  const code = cleanCode(b.code);
  const p = await getPromo(code);
  if (!p || p.deleted) fail("No such code.", 404);
  if ("active" in b) p.active = !!b.active;
  if ("startsAt" in b || "endsAt" in b) Object.assign(p, cleanTimes(b, p));
  p.changedAt = new Date().toISOString();
  await store.cmd("SET", `gde:promo:${code}`, JSON.stringify(p));
  return p;
}

// Delete a code (user, Nov 20: "allow me to delete discount codes"): it leaves the app's list and stops working at once.
// No order ever carried it: it's gone and the name is free again. Orders did carry it: a stub stays (deleted, off) so
// those orders still say which code they used and the name is never reused for a different discount.
async function deletePromo(b) {
  const code = cleanCode(b.code);
  const p = await getPromo(code);
  if (!p || p.deleted) fail("No such code.", 404);
  const used = (await store.listOrders()).some((o) => o.promoCode === code);
  if (used) await store.cmd("SET", `gde:promo:${code}`, JSON.stringify({ ...p, active: false, deleted: true, deletedAt: new Date().toISOString() }));
  else await store.cmd("DEL", `gde:promo:${code}`);
  await store.cmd("SREM", "gde:promos", code);
  return { code, nameFree: !used };
}

// Every code, newest first, with its uses and what buyers saved with it (paid orders, current environment).
async function listPromos(orders) {
  const codes = (await store.cmd("SMEMBERS", "gde:promos")) || [];
  if (!codes.length) return [];
  orders = orders || (await store.listOrders());
  const env = environment();
  const values = await store.cmd("MGET", ...codes.map((c) => `gde:promo:${c}`));
  return values.map(parse).filter(Boolean).map((p) => {
    const paid = orders.filter((o) => o.promoCode === p.code && o.status === "paid" && (o.environment || "sandbox") === env);
    return { ...p, label: label(p), uses: usesOf(p.code, orders), paidOrders: paid.length,
      saved: cents(paid.reduce((s, o) => s + (Number(o.discount?.amount) || 0), 0)),
      sales: cents(paid.reduce((s, o) => s + (Number(o.amount) || 0), 0)),
      expired: ended(p), scheduled: notYet(p) };
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

module.exports = { CODE_RE, cleanCode, checkPromo, applyTo, createPromo, updatePromo, deletePromo, listPromos, label, usesOf, when, cents };
