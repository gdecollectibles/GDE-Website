// Customer accounts and the email list.
//   GET  /api/account?action=config     what the page needs: the Google sign-in id, is everything set up
//   POST /api/account?action=google     { credential }: a Google sign-in; sets the session cookie
//   GET  /api/account?action=me         the signed-in customer, their orders and whether they get emails
//   POST /api/account?action=logout
//   POST /api/account?action=lookup     { email, invoice }: one order, for people who don't sign in with Google
//   POST /api/account?action=subscribe  { email, firstName?, source }: joins the email list (new collections, deals)
//   POST /api/account?action=unsubscribe  signed in: leaves the email list
// Stored next to the orders (see _store.js):
//   gde:subscriber:<email>  { email, firstName, status: subscribed|unsubscribed, source, verified, createdAt, updatedAt, consent }
//   gde:subscribers         sorted set of emails, by last change (the inventory app pulls them through /api/admin)
//   gde:rl:<what>:<ip>      short-lived counters against abuse
// Needs in Vercel: GOOGLE_CLIENT_ID (Google Cloud, OAuth client, "Web application"). The session cookie is signed with
// GDE_SESSION_SECRET, or a key derived from GDE_ADMIN_KEY when that isn't set.
const crypto = require("node:crypto");
const store = require("./_store");

const COOKIE = "gde_account";
const SESSION_DAYS = 30;
const CONSENT = "Emails from GDE Collectibles about new collections, limited releases and offers. Unsubscribe any time.";
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}$/;
const INVOICE_RE = /^GDE-\d{6,16}$/;

// What a customer sees about an order's state (the app's own words stay in the app).
const STATUS = {
  awaiting_payment: "Waiting for payment",
  not_paid: "Not paid",
  payment_error: "Payment didn't go through",
  declined: "Card declined",
  paid: "Paid: preparing your FFL transfer",
  voided: "Cancelled",
  refunded: "Refunded"
};

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

function setCookie(request, response, value, maxAge) {
  const proto = String(request.headers["x-forwarded-proto"] || "https").split(",")[0];
  const secure = proto === "https" ? "; Secure" : "";
  response.setHeader("Set-Cookie", `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20000) { reject(new Error("Request body is too large.")); request.destroy(); }
    });
    request.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("Invalid JSON request.")); } });
    request.on("error", reject);
  });
}

function clientIp(request) {
  return String(request.headers["x-forwarded-for"] || request.headers["x-real-ip"] || request.socket?.remoteAddress || "unknown")
    .split(",")[0].trim().slice(0, 64);
}

// At most `limit` tries per IP per hour for each kind of request.
async function allowed(request, what, limit) {
  const key = `gde:rl:${what}:${clientIp(request)}`;
  const [, count] = await store.pipeline([["SET", key, 0, "EX", 3600, "NX"], ["INCR", key]]);
  return count <= limit;
}

const normEmail = (value) => String(value || "").trim().toLowerCase().slice(0, 254);
const cleanName = (value) => String(value || "").replace(/[<>\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);

// Google checks the sign-in token itself; we only accept it for our own client id and a verified email.
async function verifyGoogle(credential) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw Object.assign(new Error("Google sign-in is not set up yet."), { status: 503 });
  if (typeof credential !== "string" || credential.length > 4096) throw Object.assign(new Error("Sign-in failed."), { status: 400 });
  const response = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential));
  const info = await response.json().catch(() => ({}));
  const okIssuer = info.iss === "accounts.google.com" || info.iss === "https://accounts.google.com";
  const fresh = Number(info.exp) * 1000 > Date.now();
  if (!response.ok || info.aud !== clientId || !okIssuer || !fresh || String(info.email_verified) !== "true" || !info.email) {
    throw Object.assign(new Error("Google could not confirm this sign-in. Please try again."), { status: 401 });
  }
  return { email: normEmail(info.email), name: cleanName(info.name || info.given_name), picture: String(info.picture || "").slice(0, 500), via: "google" };
}

// The part of an order a customer may see: no address, phone, birth date or card details.
function publicOrder(order) {
  const f = order.form || {};
  return {
    invoice: order.invoice,
    createdAt: order.createdAt,
    status: order.status,
    statusText: STATUS[order.status] || "Received",
    amount: order.amount,
    items: (order.items || []).map((i) => ({ listing: i.listing, name: i.name, price: i.price })),
    ffl: f.fflBusiness ? { business: f.fflBusiness } : null,
    test: (order.environment || "sandbox") !== "production"
  };
}

async function ordersFor(email) {
  const all = await store.listOrders();
  return all.filter((o) => normEmail(o.form?.email) === email && o.status !== "payment_error").map(publicOrder);
}

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

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  const action = new URL(request.url, "http://x").searchParams.get("action");
  const post = request.method === "POST";
  // Cookie-carrying POSTs must be JSON, which another site can't send without the browser asking first.
  if (post && !/^application\/json\b/i.test(String(request.headers["content-type"] || ""))) {
    return response.status(415).json({ error: "Send JSON." });
  }
  try {
    if (action === "config" && !post) {
      return response.status(200).json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null, ready: store.configured() && !!secret() });
    }
    if (!store.configured() || !secret()) return response.status(503).json({ error: "Accounts are not set up yet. Please try again later." });

    if (action === "google" && post) {
      if (!(await allowed(request, "signin", 30))) return response.status(429).json({ error: "Too many tries. Please wait a while." });
      const user = await verifyGoogle((await readBody(request)).credential);
      setCookie(request, response, makeSession(user), SESSION_DAYS * 86400);
      const sub = await getSubscriber(user.email);
      if (sub && !sub.verified) await saveSubscriber(user.email, { verified: true });
      return response.status(200).json({ ok: true, user: { email: user.email, name: user.name, picture: user.picture } });
    }

    if (action === "me" && !post) {
      const user = readSession(request);
      if (!user) return response.status(200).json({ user: null });
      const [orders, sub] = await Promise.all([ordersFor(user.email), getSubscriber(user.email)]);
      return response.status(200).json({
        user: { email: user.email, name: user.name, picture: user.picture },
        orders,
        subscribed: sub?.status === "subscribed"
      });
    }

    if (action === "logout" && post) {
      setCookie(request, response, "", 0);
      return response.status(200).json({ ok: true });
    }

    if (action === "lookup" && post) {
      if (!(await allowed(request, "lookup", 15))) return response.status(429).json({ error: "Too many lookups. Please wait an hour or call us." });
      const body = await readBody(request);
      const email = normEmail(body.email), invoice = String(body.invoice || "").trim().toUpperCase();
      if (!EMAIL_RE.test(email) || !INVOICE_RE.test(invoice)) {
        return response.status(400).json({ error: "Enter the email used at checkout and the order number (it starts with GDE-)." });
      }
      const value = await store.cmd("GET", `gde:order:${invoice}`);
      let order = null;
      try { order = value ? JSON.parse(value) : null; } catch {}
      // Same answer whether the number or the email is wrong, so neither can be guessed one at a time.
      if (!order || normEmail(order.form?.email) !== email || order.status === "payment_error") {
        return response.status(404).json({ error: "No order matches that email and order number." });
      }
      return response.status(200).json({ order: publicOrder(order) });
    }

    if (action === "subscribe" && post) {
      const body = await readBody(request);
      if (body.company) return response.status(200).json({ ok: true }); // hidden field only bots fill in
      const user = readSession(request);
      const email = user ? user.email : normEmail(body.email);
      if (!EMAIL_RE.test(email)) return response.status(400).json({ error: "Please enter a valid email address." });
      if (!user && !(await allowed(request, "subscribe", 8))) return response.status(429).json({ error: "Too many sign-ups from here. Please try later." });
      const source = ["popup", "account", "footer", "checkout"].includes(body.source) ? body.source : "website";
      const old = await getSubscriber(email);
      await saveSubscriber(email, {
        status: "subscribed",
        firstName: cleanName(body.firstName) || old?.firstName || (user?.name || "").split(" ")[0] || "",
        source: old?.source || source,
        verified: !!(user || old?.verified),
        consent: { text: CONSENT, at: new Date().toISOString(), page: String(body.page || "").slice(0, 200) }
      });
      return response.status(200).json({ ok: true, already: old?.status === "subscribed" });
    }

    if (action === "unsubscribe" && post) {
      const user = readSession(request);
      if (!user) return response.status(401).json({ error: "Please sign in first." });
      if (await getSubscriber(user.email)) await saveSubscriber(user.email, { status: "unsubscribed" });
      return response.status(200).json({ ok: true });
    }

    return response.status(404).json({ error: "Unknown action." });
  } catch (error) {
    if (!error.status) console.error(error);
    return response.status(error.status || 500).json({ error: error.status ? error.message : "Something went wrong. Please try again." });
  }
};
