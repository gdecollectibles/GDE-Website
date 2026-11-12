// The signed-in customer's session cookie (made in account.js at Google sign-in, read there and at checkout).
// Signed with GDE_SESSION_SECRET, or a key derived from GDE_ADMIN_KEY when that isn't set.
const crypto = require("node:crypto");

const COOKIE = "gde_account";
const SESSION_DAYS = 30;

function secret() {
  if (process.env.GDE_SESSION_SECRET) return process.env.GDE_SESSION_SECRET;
  if (process.env.GDE_ADMIN_KEY) return crypto.createHmac("sha256", process.env.GDE_ADMIN_KEY).update("gde-account-session").digest("hex");
  return "";
}

const b64 = (s) => Buffer.from(s).toString("base64url");
const sign = (data) => crypto.createHmac("sha256", secret()).update(data).digest("base64url");

function makeSession(user) {
  const data = b64(JSON.stringify({ ...user, exp: Date.now() + SESSION_DAYS * 86400000 }));
  return `${data}.${sign(data)}`;
}

function readSession(request) {
  if (!secret()) return null;
  const raw = String(request.headers.cookie || "").split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
  if (!raw) return null;
  const [data, mac] = raw.slice(COOKIE.length + 1).split(".");
  if (!data || !mac) return null;
  const want = Buffer.from(sign(data)), got = Buffer.from(mac);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try {
    const user = JSON.parse(Buffer.from(data, "base64url").toString());
    return user.exp > Date.now() && user.email ? user : null;
  } catch { return null; }
}

module.exports = { COOKIE, SESSION_DAYS, secret, makeSession, readSession };
