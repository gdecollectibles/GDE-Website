// Welcome offer (user, Nov 17, 2026: "if you sign up to the email or GDE you get $100 off your first purchase that
// lasts 30 days"). Everyone who makes an account or joins the email list gets one personal code, WELCOME-XXXXXX:
//   - $100 off (GDE can change the amount and the days in the app, or turn the offer off; codes already given keep theirs)
//   - good for 30 days from the sign-up, once, on their first purchase only (no paid order with their email yet)
//   - only with the email it was given to (typed at checkout, or the signed-in account), so it can't be passed around
//   - one per email, ever; people who signed up before the offer existed don't get one
//   - one discount per order: a club member (guns credited from outside the site) gets whichever saves more
// It goes out in the welcome email (_mail.js) and shows on the account page; signed-in buyers get it filled in at checkout.
// A use is an order that carries the code and is paid, or still waiting for payment (same as the other codes).
// Stored next to the orders (see _store.js):
//   gde:welcome:settings     { active, amount, days, address, changedAt }  (address: GDE's mailing address, for the
//                            email-list version of the welcome email, which is a marketing email; the app sends it)
//   gde:welcome:<CODE>       { code, email, amount, createdAt, endsAt, via: account|list }
//   gde:welcomeowner:<email> their code
//   gde:welcomes             list of codes, newest first
const crypto = require("node:crypto");
const store = require("./_store");
const { label, usesOf, cents } = require("./_promo");

const DEFAULTS = { active: true, amount: 100, days: 30, address: "" };
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I
const CODE_RE = /^WELCOME-[A-Z2-9]{6}$/;
const norm = (email) => String(email || "").trim().toLowerCase();
const parse = (value) => { try { return value ? JSON.parse(value) : null; } catch { return null; } };
const environment = () => (process.env.AUTHORIZE_ENV === "production" ? "production" : "sandbox");
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const cleanCode = (code) => String(code || "").trim().toUpperCase().replace(/\s+/g, "");

async function settings() { return { ...DEFAULTS, ...(parse(await store.cmd("GET", "gde:welcome:settings")) || {}) }; }

async function saveSettings(b) {
  const s = await settings();
  if ("active" in b) s.active = !!b.active;
  if ("amount" in b) {
    const amount = cents(Number(String(b.amount).replace(/[$,\s]/g, "")));
    if (!(amount >= 1 && amount <= 5000)) fail("Amount off: from $1 to $5,000.");
    s.amount = amount;
  }
  if ("days" in b) {
    const days = Math.round(Number(b.days));
    if (!(days >= 1 && days <= 365)) fail("Days: from 1 to 365.");
    s.days = days;
  }
  if ("address" in b) s.address = String(b.address || "").trim().slice(0, 300);
  s.changedAt = new Date().toISOString();
  await store.cmd("SET", "gde:welcome:settings", JSON.stringify(s));
  return s;
}

// Paid orders under this email (as the checkout email or the signed-in account), current environment.
function hasBought(email, orders) {
  const env = environment();
  return orders.some((o) => o.status === "paid" && (o.environment || "sandbox") === env && (norm(o.form?.email) === email || norm(o.account) === email));
}

// Gives this person their code, if the offer is on and they've never had one and never bought. Returns the record
// (with `isNew`) or null. Called when someone makes an account or joins the email list (account.js).
async function giveOffer(email, via, orders) {
  email = norm(email);
  if (!email) return null;
  const s = await settings();
  const have = await store.cmd("GET", `gde:welcomeowner:${email}`);
  if (have) return null;
  if (!s.active) return null;
  if (hasBought(email, orders || (await store.listOrders()))) return null;
  // Claim the email first, so two sign-ups at once can't make two codes.
  if (!(await store.cmd("SET", `gde:welcomeowner:${email}`, "pending", "NX"))) return null;
  let code = null;
  for (let i = 0; i < 6 && !code; i++) {
    const candidate = "WELCOME-" + Array.from(crypto.randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join("");
    if (await store.cmd("EXISTS", `gde:promo:${candidate}`) || await store.cmd("EXISTS", `gde:ffcode:${candidate}`)) continue;
    if (await store.cmd("SET", `gde:welcome:${candidate}`, "{}", "NX")) code = candidate;
  }
  if (!code) { await store.cmd("DEL", `gde:welcomeowner:${email}`); return null; }
  const now = Date.now();
  const record = { code, email, amount: s.amount, createdAt: new Date(now).toISOString(), endsAt: new Date(now + s.days * 86400000).toISOString(), via };
  await store.pipeline([["SET", `gde:welcome:${code}`, JSON.stringify(record)], ["SET", `gde:welcomeowner:${email}`, code], ["LPUSH", "gde:welcomes", code]]);
  return { ...record, isNew: true };
}

// The person's code and where it stands, for the account page and checkout: null when they have none.
async function offerFor(email, orders) {
  const code = await store.cmd("GET", `gde:welcomeowner:${norm(email)}`);
  if (!code || code === "pending") return null;
  const r = parse(await store.cmd("GET", `gde:welcome:${code}`));
  if (!r?.email) return null;
  orders = orders || (await store.listOrders());
  const used = usesOf(code, orders) > 0;
  const expired = Date.now() >= Date.parse(r.endsAt);
  const bought = hasBought(r.email, orders);
  return { code, amount: r.amount, label: label({ kind: "amount", value: r.amount }), endsAt: r.endsAt, used, expired, bought,
    usable: !used && !expired && !bought };
}

// Is this a welcome code, and good for this buyer right now? null = not a welcome code.
// buyerEmails: the signed-in account and the email typed at checkout (either may be missing while the form is half
// filled in; the payment API checks again with both).
async function checkWelcome(wanted, buyerEmails, orders) {
  const code = cleanCode(wanted);
  if (!CODE_RE.test(code)) return null;
  const r = parse(await store.cmd("GET", `gde:welcome:${code}`));
  const no = (error) => ({ ok: false, error });
  if (!r?.email) return no("That code isn't valid.");
  const emails = buyerEmails.map(norm).filter(Boolean);
  if (emails.length && !emails.includes(r.email)) {
    const [name, domain] = r.email.split("@");
    return no(`This welcome code works only with the email it was sent to (${name.slice(0, 2)}…@${domain}). Use that email at checkout.`);
  }
  if (Date.now() >= Date.parse(r.endsAt)) return no("That welcome code has expired.");
  orders = orders || (await store.listOrders());
  if (usesOf(code, orders) > 0) return no("That welcome code has already been used.");
  if (hasBought(r.email, orders)) return no("Welcome codes are for a first purchase.");
  return { ok: true, code, kind: "amount", value: r.amount, label: label({ kind: "amount", value: r.amount }), endsAt: r.endsAt, welcome: true, owner: r.email };
}

// For the app: the settings, totals and the latest codes.
async function overview(orders) {
  orders = orders || (await store.listOrders());
  const s = await settings();
  const env = environment();
  const codes = (await store.cmd("LRANGE", "gde:welcomes", 0, -1)) || [];
  const values = codes.length ? await store.cmd("MGET", ...codes.map((c) => `gde:welcome:${c}`)) : [];
  const byCode = new Map();
  for (const o of orders) if (o.promoCode && /^WELCOME-/.test(o.promoCode) && (o.environment || "sandbox") === env) (byCode.get(o.promoCode) || byCode.set(o.promoCode, []).get(o.promoCode)).push(o);
  const now = Date.now();
  const list = values.map(parse).filter((r) => r?.email).map((r) => {
    const os = byCode.get(r.code) || [], paid = os.find((o) => o.status === "paid");
    return { code: r.code, email: r.email, amount: r.amount, via: r.via, createdAt: r.createdAt, endsAt: r.endsAt,
      status: paid ? "used" : os.some((o) => o.status === "awaiting_payment") ? "checkout" : now >= Date.parse(r.endsAt) ? "expired" : "open",
      invoice: paid?.invoice || null, sale: paid ? Number(paid.amount) : 0, saved: paid ? Number(paid.discount?.amount) || 0 : 0 };
  });
  const used = list.filter((r) => r.status === "used");
  return {
    settings: { active: s.active, amount: s.amount, days: s.days, address: s.address, changedAt: s.changedAt || null },
    totals: { given: list.length, open: list.filter((r) => r.status === "open").length, used: used.length,
      expired: list.filter((r) => r.status === "expired").length, sales: cents(used.reduce((t, r) => t + r.sale, 0)), saved: cents(used.reduce((t, r) => t + r.saved, 0)) },
    codes: list.slice(0, 100)
  };
}

module.exports = { CODE_RE, settings, saveSettings, giveOffer, offerFor, checkWelcome, overview };
