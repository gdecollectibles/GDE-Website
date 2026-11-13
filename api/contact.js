// The Contact page form (contact.html). Saves each message in the store; the GDE app picks them up every couple of
// minutes into Customers > Website inquiries (via /api/admin?action=messages). Replaced Formspree on Nov 13, 2026.
//   POST /api/contact   JSON (or a plain form post): { name, email, phone, state, collection: [names], contactPreference: [Call|Text|Email], message }
// Stored next to the orders (see _store.js):
//   gde:message:<id>   one message, kept 180 days (the app keeps its own copy)
//   gde:messages       message ids, newest first
const crypto = require("node:crypto");
const store = require("./_store");

const PER_HOUR = 5;          // messages from one address in an hour
const KEEP_SECONDS = 180 * 86400;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/;
// The site's collections plus the Gallery (the Contact page's "Collections of interest" tick boxes); none ticked = general.
const COLLECTIONS = ["The Capital", "Remember the Alamo", "Blue Finish", "US Constitution", "Mt. Rushmore", "USS Constitution",
  "America's 250 Anniversary", "Donald J Trump", "El Alamo", "Scrolls", "Gallery"];
const PREFERENCES = ["Call", "Text", "Email"]; // "How should we reach you?" (optional)

const clean = (value, max) => String(value ?? "").replace(/[<>\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, max);

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 40000) { reject(Object.assign(new Error("That message is too long."), { status: 413 })); request.destroy(); }
    });
    request.on("end", () => {
      const json = /^application\/json\b/i.test(String(request.headers["content-type"] || ""));
      try {
        if (json) return resolve(body ? JSON.parse(body) : {});
        const params = new URLSearchParams(body);
        resolve({ ...Object.fromEntries(params), collection: params.getAll("collection"), contactPreference: params.getAll("contactPreference") });
      }
      catch { reject(Object.assign(new Error("Invalid request."), { status: 400 })); }
    });
    request.on("error", reject);
  });
}

function clientIp(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || request.socket?.remoteAddress || "unknown";
}

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return response.status(405).json({ error: "Use POST." });
  // A plain form post (no JavaScript) goes back to the page instead of seeing JSON.
  const plain = !/^application\/json\b/i.test(String(request.headers["content-type"] || ""));
  const reply = (status, body) => plain
    ? response.status(303).setHeader("Location", status === 200 ? "/contact.html?sent=1" : "/contact.html?error=1").end()
    : response.status(status).json(body);
  if (!store.configured()) return reply(503, { error: "The form is not working right now. Please call or email us instead." });

  try {
    const body = await readBody(request);
    // Left empty by people; filled in by spam bots, which then get a normal "thank you".
    if (clean(body.website, 200)) return reply(200, { ok: true });

    const record = {
      name: clean(body.name, 120),
      email: clean(body.email, 200).replace(/\s+/g, "").toLowerCase(),
      phone: clean(body.phone, 40),
      state: clean(body.state, 60),
      collection: [...new Set([body.collection].flat().filter((c) => COLLECTIONS.includes(c)))].join(", ") || "General inquiry",
      prefer: PREFERENCES.filter((p) => [body.contactPreference].flat().includes(p)).join(", "),
      message: clean(body.message, 5000)
    };
    if (!record.name) return reply(400, { error: "Please enter your name." });
    if (!EMAIL_PATTERN.test(record.email)) return reply(400, { error: "Please check your email address. It should look like name@example.com." });
    if (!record.phone) return reply(400, { error: "Please enter your phone number." });
    if (!record.message) return reply(400, { error: "Please write a message." });

    const key = `gde:rl:contact:${crypto.createHash("sha256").update(clientIp(request)).digest("hex").slice(0, 32)}`;
    const [, count] = await store.pipeline([["SET", key, 0, "EX", 3600, "NX"], ["INCR", key]]);
    if (count > PER_HOUR) return reply(429, { error: "That's a lot of messages in a short time. Please call or email us instead." });

    const id = `M-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
    const saved = { id, createdAt: new Date().toISOString(), ...record };
    await store.pipeline([
      ["SET", `gde:message:${id}`, JSON.stringify(saved), "EX", KEEP_SECONDS],
      ["LPUSH", "gde:messages", id],
      ["LTRIM", "gde:messages", 0, 1999]
    ]);
    return reply(200, { ok: true, id });
  } catch (error) {
    if (!error.status) console.error(error);
    return reply(error.status || 500, { error: error.status ? error.message : "Something went wrong. Please try again, or call or email us." });
  }
};
