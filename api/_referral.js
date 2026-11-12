// Share links (user, Nov 12, 2026): once a customer has bought a gun, their account gets a personal link
// (https://www.gdecollectibles.com/?ref=<CODE>). The link gives no discount; when a friend buys through it, the friend's
// guns also count toward the link owner's club (Collectors Club / Legacy Club, see _collector.js).
// The browser keeps the code for 30 days after the click and drops it after a purchase (script.js); the payment API
// saves the owner on the order as `referredBy`. Nobody counts through their own link.
// Stored next to the orders (see _store.js):
//   gde:ref:<CODE>        the owner's email
//   gde:refowner:<email>  their code
const crypto = require("node:crypto");
const store = require("./_store");

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I
const CODE_RE = /^[A-Z2-9]{8}$/;
const SITE = (process.env.SITE_URL || "https://www.gdecollectibles.com").replace(/\/$/, "");
const norm = (email) => String(email || "").trim().toLowerCase();

const newCode = () => Array.from(crypto.randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join("");
const linkFor = (code) => `${SITE}/?ref=${code}`;

// The owner's code, made the first time it's asked for (only for someone who has bought at least one gun).
async function linkOf(email, status) {
  email = norm(email);
  if (!email || !(status?.guns >= 1)) return null;
  let code = await store.cmd("GET", `gde:refowner:${email}`);
  if (!code) {
    for (let i = 0; i < 5 && !code; i++) {
      const candidate = newCode();
      if (await store.cmd("SET", `gde:ref:${candidate}`, email, "NX")) code = candidate;
    }
    if (!code) return null;
    await store.cmd("SET", `gde:refowner:${email}`, code);
  }
  return { code, link: linkFor(code), guns: status.referred || 0 };
}

// Whose link is this, if it may count for this purchase? Null when unknown or when the buyer is the owner.
async function ownerOf(code, ...buyerEmails) {
  code = String(code || "").trim().toUpperCase();
  if (!CODE_RE.test(code)) return null;
  const owner = await store.cmd("GET", `gde:ref:${code}`);
  if (!owner) return null;
  if (buyerEmails.map(norm).includes(owner)) return null;
  return { code, owner };
}

module.exports = { linkOf, ownerOf, linkFor };
