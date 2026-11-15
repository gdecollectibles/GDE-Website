// Customer accounts and the email list.
//   GET  /api/account?action=config     what the page needs: the Google sign-in id, is everything set up
//   POST /api/account?action=google     { credential }: a Google sign-in; sets the session cookie
//   POST /api/account?action=register     { email, password, firstName, lastName }: emails a 6-digit code (api/_mail.js)
//   POST /api/account?action=verify       { email, code }: the sign-up code; makes the account and signs in
//   POST /api/account?action=login        { email, password }
//   POST /api/account?action=reset        { email }: emails a password-reset code (same answer whether or not the account exists)
//   POST /api/account?action=reset-finish { email, code, password }: new password, signs in
//   GET  /api/account?action=me        the signed-in customer, their orders, collector status and whether they get emails
//   POST /api/account?action=logout
//   POST /api/account?action=lookup     { email, invoice }: one order, for people who don't sign in with Google
//   POST /api/account?action=subscribe  { email, firstName?, source }: joins the email list (new collections, deals)
//   POST /api/account?action=unsubscribe  signed in: leaves the email list
//   POST /api/account?action=decline      signed in: "no thanks" to the list question asked after the first sign-in
//   POST /api/account?action=ffcode-create { code }: a Legacy Club member makes their friends and family code (_ffcode.js)
//   GET  /api/account?action=ffcode-check&code=<code>  checkout asks whether a code is good (5% off)
// Stored next to the orders (see _store.js), one record per person, whether they joined the list, signed in, or both:
//   gde:subscriber:<email>  { email, firstName, lastName, status: none|declined|subscribed|unsubscribed, account (signed in
//                             with Google), source, verified, signedInAt, createdAt, updatedAt, consent }
//   gde:subscribers         sorted set of emails, by last change (the inventory app pulls them through /api/admin)
//   gde:pw:<email>          { salt, hash, createdAt, updatedAt }: the password of an email + password account (scrypt).
//                           Only made after the emailed code proves the email is theirs, so orders and club discounts
//                           tied to an email can't be claimed by someone else.
//   gde:code:<purpose>:<email>  { codeHash, tries, ...pending sign-up (salt + hash of the password) }: the emailed code, 15 minutes
//   gde:rl:<what>:<ip>      short-lived counters against abuse
// Needs in Vercel: GOOGLE_CLIENT_ID (Google Cloud, OAuth client, "Web application"). The session cookie is signed with
// GDE_SESSION_SECRET, or a key derived from GDE_ADMIN_KEY when that isn't set (see _session.js).
const store = require("./_store");
const { COOKIE, SESSION_DAYS, secret, makeSession, readSession } = require("./_session");
const { collectorStatus } = require("./_collector");
const ffcode = require("./_ffcode");
const referral = require("./_referral");
const mail = require("./_mail");
const crypto = require("node:crypto");

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

const listSource = (value) => (["popup", "account", "footer", "checkout", "signup"].includes(value) ? value : "website");
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
  return {
    email: normEmail(info.email), name: cleanName(info.name || info.given_name), picture: String(info.picture || "").slice(0, 500), via: "google",
    firstName: cleanName(info.given_name), lastName: cleanName(info.family_name)
  };
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

// Orders placed with this email at checkout, or while signed in to this account.
function ordersFor(email, all) {
  return all.filter((o) => (normEmail(o.form?.email) === email || normEmail(o.account) === email) && o.status !== "payment_error").map(publicOrder);
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

// ---- email + password accounts
const CODE_MINUTES = 15;
const CODE_TRIES = 5;
const scrypt = (password, salt) => new Promise((resolve, reject) =>
  crypto.scrypt(String(password).normalize("NFKC"), salt, 64, { N: 16384, r: 8, p: 1 }, (e, key) => (e ? reject(e) : resolve(key))));

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64");
  return { salt, hash: (await scrypt(password, salt)).toString("base64") };
}

async function checkPassword(record, password) {
  if (!record?.salt || !record?.hash) {
    await scrypt(password, "no-account-padding"); // same time either way, so it doesn't tell which emails have accounts
    return false;
  }
  const want = Buffer.from(record.hash, "base64"), got = await scrypt(password, record.salt);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

function passwordProblem(password) {
  const p = String(password || "");
  if (p.length < 8) return "Use at least 8 characters for your password.";
  if (p.length > 200) return "That password is too long.";
  return "";
}

async function getJson(key) {
  const value = await store.cmd("GET", key);
  try { return value ? JSON.parse(value) : null; } catch { return null; }
}

const codeHash = (email, code) => crypto.createHmac("sha256", secret()).update(`${email}:${code}`).digest("hex");

// Makes and emails a new code; `extra` is kept with it (the pending sign-up's name and password hash).
async function startCode(purpose, email, extra = {}) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  await store.cmd("SET", `gde:code:${purpose}:${email}`, JSON.stringify({ ...extra, codeHash: codeHash(email, code), tries: 0 }), "EX", CODE_MINUTES * 60);
  await mail.sendCode(email, code, purpose);
}

// The pending record if the code is right; wrong codes count, and after 5 the code is gone.
async function useCode(purpose, email, code) {
  const key = `gde:code:${purpose}:${email}`;
  const pending = await getJson(key);
  const expired = Object.assign(new Error("That code has expired. Ask for a new one."), { status: 400 });
  if (!pending) throw expired;
  const want = Buffer.from(pending.codeHash || ""), got = Buffer.from(codeHash(email, String(code || "").replace(/\D/g, "")));
  if (want.length === got.length && crypto.timingSafeEqual(want, got)) {
    await store.cmd("DEL", key);
    return pending;
  }
  if (pending.tries + 1 >= CODE_TRIES) { await store.cmd("DEL", key); throw expired; }
  const ttl = Number(await store.cmd("TTL", key)) || 60;
  await store.cmd("SET", key, JSON.stringify({ ...pending, tries: pending.tries + 1 }), "EX", Math.max(ttl, 1));
  throw Object.assign(new Error("That code isn't right. Check the email and try again."), { status: 400 });
}

// Signs the customer in (session cookie) and keeps their record, like a Google sign-in.
async function signIn(request, response, email, names = {}) {
  const old = await getSubscriber(email);
  const firstName = old?.firstName || cleanName(names.firstName), lastName = old?.lastName || cleanName(names.lastName);
  const user = { email, name: [firstName, lastName].filter(Boolean).join(" "), picture: "", via: "password" };
  setCookie(request, response, makeSession(user), SESSION_DAYS * 86400);
  await saveSubscriber(email, {
    account: true, verified: true, signedInAt: new Date().toISOString(), firstName, lastName,
    signupVia: old?.signupVia || (old?.account ? "google" : "password"), // the inventory app's Customers note says which
    status: old?.status || "none", source: old?.source || "account"
  });
  return { email: user.email, name: user.name, picture: "" };
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
      return response.status(200).json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null, ready: store.configured() && !!secret(), emailLogin: mail.configured() });
    }
    if (!store.configured() || !secret()) return response.status(503).json({ error: "Accounts are not set up yet. Please try again later." });

    if (action === "google" && post) {
      if (!(await allowed(request, "signin", 30))) return response.status(429).json({ error: "Too many tries. Please wait a while." });
      const { firstName, lastName, ...user } = await verifyGoogle((await readBody(request)).credential);
      setCookie(request, response, makeSession(user), SESSION_DAYS * 86400);
      // Every account is kept (the inventory app files it in Customers); "none" means not asked about the list yet.
      const old = await getSubscriber(user.email);
      await saveSubscriber(user.email, {
        account: true, verified: true, signedInAt: new Date().toISOString(), signupVia: old?.signupVia || "google",
        firstName: old?.firstName || firstName, lastName: old?.lastName || lastName,
        status: old?.status || "none", source: old?.source || "account"
      });
      return response.status(200).json({ ok: true, user: { email: user.email, name: user.name, picture: user.picture } });
    }

    if (action === "register" && post) {
      if (!(await allowed(request, "register", 6))) return response.status(429).json({ error: "Too many tries. Please wait a while." });
      const body = await readBody(request);
      const email = normEmail(body.email), firstName = cleanName(body.firstName), lastName = cleanName(body.lastName);
      if (!EMAIL_RE.test(email)) return response.status(400).json({ error: "Please enter a valid email address." });
      if (!firstName) return response.status(400).json({ error: "Please enter your first name." });
      const problem = passwordProblem(body.password);
      if (problem) return response.status(400).json({ error: problem });
      if (await store.cmd("EXISTS", `gde:pw:${email}`)) {
        return response.status(409).json({ error: "There's already an account with this email. Log in instead, or reset your password." });
      }
      // The "Email me" box is kept with the pending sign-up and saved (with the consent wording) once the code is in.
      await startCode("signup", email, {
        firstName, lastName, ...(await hashPassword(body.password)),
        emails: body.emails === true, source: listSource(body.source), page: String(body.page || "").slice(0, 200)
      });
      return response.status(200).json({ ok: true });
    }

    if (action === "verify" && post) {
      if (!(await allowed(request, "verify", 30))) return response.status(429).json({ error: "Too many tries. Please wait a while." });
      const body = await readBody(request);
      const email = normEmail(body.email);
      const pending = await useCode("signup", email, body.code);
      const now = new Date().toISOString();
      await store.cmd("SET", `gde:pw:${email}`, JSON.stringify({ salt: pending.salt, hash: pending.hash, createdAt: now, updatedAt: now }));
      const user = await signIn(request, response, email, pending);
      const old = await getSubscriber(email);
      if (pending.emails) {
        await saveSubscriber(email, {
          status: "subscribed", source: old?.source && old.source !== "account" ? old.source : pending.source,
          consent: { text: CONSENT, at: new Date().toISOString(), page: pending.page }
        });
      } else if (!old || old.status === "none") {
        await saveSubscriber(email, { status: "declined" }); // left the box unticked: account only, no promotional email
      }
      return response.status(200).json({ ok: true, user, created: true, subscribed: !!pending.emails || old?.status === "subscribed" });
    }

    if (action === "login" && post) {
      if (!(await allowed(request, "login", 20))) return response.status(429).json({ error: "Too many tries. Please wait a while, or reset your password." });
      const body = await readBody(request);
      const email = normEmail(body.email);
      const record = EMAIL_RE.test(email) ? await getJson(`gde:pw:${email}`) : null;
      if (!(await checkPassword(record, body.password))) {
        return response.status(401).json({ error: "That email and password don't match. Signed up with Google? Use Continue with Google." });
      }
      return response.status(200).json({ ok: true, user: await signIn(request, response, email) });
    }

    if (action === "reset" && post) {
      if (!(await allowed(request, "reset", 6))) return response.status(429).json({ error: "Too many tries. Please wait a while." });
      const email = normEmail((await readBody(request)).email);
      if (!EMAIL_RE.test(email)) return response.status(400).json({ error: "Please enter a valid email address." });
      // Only accounts with a password get a code, but the answer is the same either way.
      if (!mail.configured()) return response.status(503).json({ error: "Password reset isn't available yet. Please contact us." });
      if (await store.cmd("EXISTS", `gde:pw:${email}`)) await startCode("reset", email);
      return response.status(200).json({ ok: true });
    }

    if (action === "reset-finish" && post) {
      if (!(await allowed(request, "verify", 30))) return response.status(429).json({ error: "Too many tries. Please wait a while." });
      const body = await readBody(request);
      const email = normEmail(body.email);
      const problem = passwordProblem(body.password);
      if (problem) return response.status(400).json({ error: problem });
      await useCode("reset", email, body.code);
      const old = await getJson(`gde:pw:${email}`);
      await store.cmd("SET", `gde:pw:${email}`, JSON.stringify({ ...(await hashPassword(body.password)), createdAt: old?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }));
      return response.status(200).json({ ok: true, user: await signIn(request, response, email) });
    }

    if (action === "me" && !post) {
      const user = readSession(request);
      if (!user) return response.status(200).json({ user: null });
      const [all, sub] = await Promise.all([store.listOrders(), getSubscriber(user.email)]);
      const collector = await collectorStatus(user.email, all);
      return response.status(200).json({
        user: { email: user.email, name: user.name, picture: user.picture },
        orders: ordersFor(user.email, all),
        collector,
        ffCode: collector.tier === "legacy" ? await ffcode.codeFor(user.email, all) : null,
        referral: await referral.linkOf(user.email, collector),
        subscribed: sub?.status === "subscribed",
        listStatus: sub?.status || "none"
      });
    }

    if (action === "ffcode-create" && post) {
      const user = readSession(request);
      if (!user) return response.status(401).json({ error: "Please sign in first." });
      if (!(await allowed(request, "ffcode", 20))) return response.status(429).json({ error: "Too many tries. Please wait a while." });
      return response.status(200).json({ ok: true, ffCode: await ffcode.createCode(user.email, (await readBody(request)).code) });
    }

    if (action === "ffcode-check" && !post) {
      if (!(await allowed(request, "ffcheck", 30))) return response.status(429).json({ error: "Too many tries. Please wait a while." });
      const user = readSession(request);
      const result = await ffcode.checkCode(new URL(request.url, "http://x").searchParams.get("code"), user?.email);
      return response.status(result.ok ? 200 : 404).json(result.ok ? { ok: true, code: result.code, percent: result.percent, usesLeft: result.usesLeft } : { error: result.error });
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
      const source = listSource(body.source);
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

    if (action === "decline" && post) {
      // "No thanks" to the list question after signing up: remembered so it isn't asked again.
      const user = readSession(request);
      if (!user) return response.status(401).json({ error: "Please sign in first." });
      const old = await getSubscriber(user.email);
      if (!old || old.status === "none") await saveSubscriber(user.email, { status: "declined" });
      return response.status(200).json({ ok: true });
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
