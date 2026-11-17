// One record per person who has an account or is (or was) on the email list, shared by account.js, unsubscribe.js
// and admin.js. The inventory app pulls changed records through /api/admin?action=subscribers.
//   gde:subscriber:<email>  { email, firstName, lastName, status: none|declined|subscribed|unsubscribed, account,
//                             signupVia, source, verified, signedInAt, createdAt, updatedAt, consent, unsubscribedAt,
//                             country, region, city (where they signed up from, by IP; Nov 17, see account.js) }
//   gde:subscribers         sorted set of emails, by last change
const crypto = require("node:crypto");
const store = require("./_store");

const CONSENT = "Emails from GDE Collectibles about new collections, limited releases and offers. Unsubscribe any time.";
const SITE = "https://www.gdecollectibles.com";
const normEmail = (value) => String(value || "").trim().toLowerCase().slice(0, 254);

async function getSubscriber(email) {
  const value = await store.cmd("GET", `gde:subscriber:${email}`);
  try { return value ? JSON.parse(value) : null; } catch { return null; }
}

async function saveSubscriber(email, changes) {
  const now = new Date().toISOString();
  const old = (await getSubscriber(email)) || { email, createdAt: now };
  const next = { ...old, ...changes, email, updatedAt: now };
  await store.pipeline([
    ["SET", `gde:subscriber:${email}`, JSON.stringify(next)],
    ["ZADD", "gde:subscribers", Date.now(), email]
  ]);
  return next;
}

// ---- unsubscribe links (in every email the inventory app sends through admin.js)
// The link carries the email (base64url) and a signature, so nobody can unsubscribe someone else by guessing.
// Signed with a key derived from GDE_ADMIN_KEY (or GDE_SESSION_SECRET when set).
function unsubKey() {
  const base = process.env.GDE_SESSION_SECRET || process.env.GDE_ADMIN_KEY || "";
  if (!base) throw Object.assign(new Error("Unsubscribe links aren't set up (no key in Vercel)."), { status: 503 });
  return crypto.createHmac("sha256", base).update("gde-unsubscribe-v1").digest();
}
const unsubToken = (email) => crypto.createHmac("sha256", unsubKey()).update(`unsub:${normEmail(email)}`).digest("base64url").slice(0, 32);

function unsubParams(email) {
  return `e=${Buffer.from(normEmail(email)).toString("base64url")}&t=${unsubToken(email)}`;
}

// The page people click in the email, and the address Gmail/Yahoo's one-click button posts to.
const unsubPage = (email) => `${SITE}/unsubscribe?${unsubParams(email)}`;
const unsubOneClick = (email) => `${SITE}/api/unsubscribe?${unsubParams(email)}`;

// The email from a link's e and t, or null if the signature doesn't match.
function readUnsub(e, t) {
  let email = "";
  try { email = normEmail(Buffer.from(String(e || ""), "base64url").toString()); } catch { return null; }
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return null;
  const want = Buffer.from(unsubToken(email)), got = Buffer.from(String(t || ""));
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? email : null;
}

module.exports = { CONSENT, normEmail, getSubscriber, saveSubscriber, unsubPage, unsubOneClick, readUnsub };
