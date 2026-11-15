// Spam guard for the Contact and Piece Unique forms (added Nov 15, 2026, after bot messages got past the hidden "website" trap).
// 1. The page asks GET /api/contact?token when it opens and sends the signed token back with the form.
//    Bots that post straight to the API never have one; a forged one fails the signature.
// 2. A real person needs a few seconds to fill the form in; a token used sooner is a bot.
// 3. Phone numbers in the 555 exchange (e.g. 202-555-0191) are reserved for films and are not real lines.
// Bots get a normal "thank you" so they don't retry; each one is counted in gde:spam:blocked (by reason).
const crypto = require("node:crypto");
const { secret } = require("./_session");

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

module.exports = { issue, check };
