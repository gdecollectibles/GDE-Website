// "Piece Unique" custom-piece requests (piece-unique.html + piece-unique.js, user Nov 13, 2026): the gun (model, caliber),
// whose design (own / GDE designs it / a collection changed), where it goes, colors and finish, budget. Saved with the
// Contact page messages (same list, kind "custom"), so the GDE app shows them in its Website page, Piece Unique tab.
// Files (pictures or PDFs of the design) are shrunk in the browser first.
//   POST /api/custom-request   JSON: { name, email, phone, state, model, modelOther, caliber, caliberOther, gunDetails, design,
//                              collection, message, text, placement: [..], slide, frame, engraving, grips, colorNotes, budget,
//                              when, contactPreference: [Call|Text|Email], files: [{ name, data (base64) }] }
// Stored (see _store.js):
//   gde:message:<id>           { id, kind: "custom", createdAt, name, email, phone, state, model, caliber, gunDetails, design,
//                              collection, message, text, placement, slide, frame, engraving, grips, colorNotes, budget, when,
//                              prefer, files: [{ n, name, type, size }] }, kept 180 days
//   gde:messages               message ids, newest first (shared with api/contact.js)
//   gde:msgfile:<id>:<n>       one file, base64, kept as long as its message
const crypto = require("node:crypto");
const store = require("./_store");

const PER_HOUR = 4;
const KEEP_SECONDS = 180 * 86400;
const MAX_FILES = 4;
const MAX_FILE_BYTES = 700 * 1024; // each store write stays well inside the store's request limit
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/;
// The form's choices (piece-unique.js has the same lists: change both together).
const MODELS = ["Colt M1911", "Colt Government Model", "Colt Government Series 70", "Another model", "Not sure, recommend one"];
const CALIBERS = [".45 ACP", ".38 Super", "9mm", "Another caliber", "Not sure"];
const DESIGNS = { own: "Their own design", gde: "GDE designs it", collection: "Start from a collection" };
const COLLECTIONS = ["The Capital", "Remember the Alamo", "Blue Finish", "US Constitution", "Mt. Rushmore", "USS Constitution",
  "America's 250 Anniversary", "Donald J Trump", "El Alamo", "Scrolls"];
const PLACEMENTS = ["Slide, left side", "Slide, right side", "Top of the slide", "Frame", "Grips", "Everywhere"];
const FINISHES = ["Polished stainless steel", "24K gold plated", "Nickel", "Royal blue", "Black", "Your choice", "Something else (tell us below)"];
const FILLS = ["Gold-filled", "Silver / nickel", "Black", "Color (tell us below)", "Plain engraving, no fill", "Your choice"];
const GRIPS = ["Pearl white", "Pearl brown", "Pearl blue", "Black pearl", "Wood", "Your choice", "Something else (tell us below)"];
const BUDGETS = ["Under $3,000", "$3,000 to $5,000", "$5,000 to $8,000", "Over $8,000", "Not sure yet"];
const PREFERENCES = ["Call", "Text", "Email"];

const clean = (value, max) => String(value ?? "").replace(/[<>\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, max);

function sniff(buffer) {
  const hex = buffer.subarray(0, 12).toString("hex");
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  if (hex.startsWith("89504e470d0a1a0a")) return "image/png";
  if (hex.startsWith("52494646") && buffer.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buffer.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  return null;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 4200000) { reject(Object.assign(new Error("The files are too large together. Send fewer or smaller ones."), { status: 413 })); request.destroy(); }
    });
    request.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(Object.assign(new Error("Invalid request."), { status: 400 })); } });
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
  if (!/^application\/json\b/i.test(String(request.headers["content-type"] || ""))) return response.status(415).json({ error: "Send JSON." });
  if (!store.configured()) return response.status(503).json({ error: "The form is not working right now. Please call or email us instead." });

  try {
    const body = await readBody(request);
    if (clean(body.website, 200)) return response.status(200).json({ ok: true }); // spam trap, left empty by people

    const list = (value, allowed) => [...new Set([value].flat().filter((v) => allowed.includes(v)))];
    const one = (value, allowed) => (allowed.includes(value) ? value : "");
    const design = Object.hasOwn(DESIGNS, body.design) ? body.design : "";
    const model = one(body.model, MODELS), caliber = one(body.caliber, CALIBERS);
    const record = {
      kind: "custom",
      name: clean(body.name, 120),
      email: clean(body.email, 200).replace(/\s+/g, "").toLowerCase(),
      phone: clean(body.phone, 40),
      state: clean(body.state, 60),
      model: model === "Another model" ? clean(body.modelOther, 120) || model : model || "Not sure, recommend one",
      caliber: caliber === "Another caliber" ? clean(body.caliberOther, 60) || caliber : caliber || "Not sure",
      gunDetails: clean(body.gunDetails, 300),
      design,
      collection: design === "collection" ? one(body.collection, COLLECTIONS) : "",
      message: clean(body.message, 5000),
      text: clean(body.text, 300),
      placement: list(body.placement, PLACEMENTS).join(", "),
      slide: one(body.slide, FINISHES),
      frame: one(body.frame, FINISHES),
      engraving: one(body.engraving, FILLS),
      grips: one(body.grips, GRIPS),
      colorNotes: clean(body.colorNotes, 300),
      budget: one(body.budget, BUDGETS),
      when: clean(body.when, 80),
      prefer: list(body.contactPreference, PREFERENCES).join(", ")
    };
    if (!design) return response.status(400).json({ error: "Choose whose design it is: yours, ours, or one of our collections." });
    if (design === "collection" && !record.collection) return response.status(400).json({ error: "Choose which collection to start from." });
    if (!record.name) return response.status(400).json({ error: "Please enter your name." });
    if (!EMAIL_PATTERN.test(record.email)) return response.status(400).json({ error: "Please check your email address. It should look like name@example.com." });
    if (!record.phone) return response.status(400).json({ error: "Please enter your phone number." });

    const files = [];
    for (const f of (Array.isArray(body.files) ? body.files : []).slice(0, MAX_FILES + 1)) {
      if (files.length >= MAX_FILES) return response.status(400).json({ error: `Up to ${MAX_FILES} files, please.` });
      const buffer = Buffer.from(String(f?.data || ""), "base64");
      const type = sniff(buffer);
      const name = clean(f?.name, 120) || "picture";
      if (!type) return response.status(400).json({ error: `${name} isn't a picture or a PDF.` });
      if (buffer.length > MAX_FILE_BYTES) return response.status(400).json({ error: `${name} is too large. Send a smaller picture or a screenshot.` });
      files.push({ name, type, buffer });
    }

    if (design === "own" && !files.length && !record.message) return response.status(400).json({ error: "Upload your design, or tell us about it." });
    if (design !== "own" && !record.message) return response.status(400).json({ error: design === "gde" ? "Tell us about the design you'd like." : "Tell us what you'd like changed." });

    const key = `gde:rl:custom:${crypto.createHash("sha256").update(clientIp(request)).digest("hex").slice(0, 32)}`;
    const [, count] = await store.pipeline([["SET", key, 0, "EX", 3600, "NX"], ["INCR", key]]);
    if (count > PER_HOUR) return response.status(429).json({ error: "That's a lot of requests in a short time. Please call or email us instead." });

    const id = `M-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
    // One write per picture, so no single call to the store gets large.
    for (const [n, f] of files.entries()) await store.cmd("SET", `gde:msgfile:${id}:${n}`, f.buffer.toString("base64"), "EX", KEEP_SECONDS);
    const saved = { id, createdAt: new Date().toISOString(), ...record,
      files: files.map((f, n) => ({ n, name: f.name, type: f.type, size: f.buffer.length })) };
    await store.pipeline([
      ["SET", `gde:message:${id}`, JSON.stringify(saved), "EX", KEEP_SECONDS],
      ["LPUSH", "gde:messages", id],
      ["LTRIM", "gde:messages", 0, 1999]
    ]);
    return response.status(200).json({ ok: true, id });
  } catch (error) {
    if (!error.status) console.error(error);
    return response.status(error.status || 500).json({ error: error.status ? error.message : "Something went wrong. Please try again, or call or email us." });
  }
};
