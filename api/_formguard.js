// Spam guard for the Contact and Piece Unique forms (added Nov 15, 2026, after bot messages got past the hidden "website" trap).
// 1. The page asks GET /api/contact?token when it opens and sends the signed token back with the form.
//    Bots that post straight to the API never have one; a forged one fails the signature.
// 2. A real person needs a few seconds to fill the form in; a token used sooner is a bot.
// 3. Phone numbers in the 555 exchange (e.g. 202-555-0191) are reserved for films and are not real lines.
// Bots get a normal "thank you" so they don't retry; each one is counted in gde:spam:blocked (by reason).
// Since Nov 25 (user: keep every message that is spam) a copy of each blocked message is kept too, so the app's
// Spam list shows what was caught and a real person caught by mistake can be moved back:
//   gde:blocked:<id>   one blocked message (B-<ms>-<hex>), kept 90 days
//   gde:blocked        their ids, newest first, the last 500
const crypto = require("node:crypto");
const { secret } = require("./_session");
const store = require("./_store");

const MIN_SECONDS = 3;          // fastest a person fills the form in
const MAX_AGE_HOURS = 48;       // a page left open longer than this asks for a reload

const sign = (data) => crypto.createHmac("sha256", secret()).update(`gde-form:${data}`).digest("base64url");

function issue() {
  const issued = String(Date.now());
  return `${issued}.${sign(issued)}`;
}

// Returns { ok: true }, { bot: "<reason>" } (drop quietly) or { error: "<message for the person>" }.
function check(body) {
  if (!secret()) return { ok: true }; // no key set (local testing): skip the token check
  const [issued, mac] = String(body.formToken || "").split(".");
  if (!issued || !mac) return { error: "Please reload the page and send your message again." };
  const want = Buffer.from(sign(issued)), got = Buffer.from(mac);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return { bot: "forged-token" };
  const age = Date.now() - Number(issued);
  if (!(age >= MIN_SECONDS * 1000)) return { bot: "too-fast" };
  if (age > MAX_AGE_HOURS * 3600000) return { error: "This page was open a long time. Please reload it and send your message again." };
  let digits = String(body.phone || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length === 10 && digits.slice(3, 6) === "555") return { bot: "fake-phone" };
  return { ok: true };
}

const KEEP_BLOCKED_SECONDS = 90 * 86400;
const short = (value, max) => String(value ?? "").replace(/[<>\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, max);

// Counts a blocked message by form + reason and keeps a short copy of what it said. Never throws: a bot still gets
// its "thank you" if the store is busy. form: contact | custom; reason: trap | forged-token | too-fast | fake-phone.
async function keep(form, reason, body) {
  const id = `B-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const list = (v) => [v].flat().filter(Boolean).map((x) => short(x, 60)).join(", ");
  const record = {
    id, form, reason, createdAt: new Date().toISOString(),
    name: short(body.name, 120), email: short(body.email, 200).replace(/\s+/g, "").toLowerCase(),
    phone: short(body.phone, 40), state: short(body.state, 60),
    collection: short(list(body.collection), 300), prefer: short(list(body.contactPreference), 60),
    model: short(body.model, 120), caliber: short(body.caliber, 60), design: short(body.design, 40),
    message: short(body.message, 3000), files: Array.isArray(body.files) ? body.files.length : 0,
    trap: reason === "trap" ? short(body.website, 200) : undefined
  };
  await store.pipeline([
    ["HINCRBY", "gde:spam:blocked", `${form}:${reason}`, 1],
    ["SET", `gde:blocked:${id}`, JSON.stringify(record), "EX", KEEP_BLOCKED_SECONDS],
    ["LPUSH", "gde:blocked", id],
    ["LTRIM", "gde:blocked", 0, 499]
  ]).catch(() => {});
}

module.exports = { issue, check, keep };
