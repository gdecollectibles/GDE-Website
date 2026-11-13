// A signed-in customer asks GDE to count guns they bought outside the website toward their collector tier
// (collector-request.html; storage and the review flow in _credits.js).
//   GET  /api/collector-request   signed in: { user, status, requests } (their own requests); signed out: { user: null }
//   POST /api/collector-request   signed in, JSON: { name, phone, where, whereOther, when, guns, which, explanation,
//                                 files: [{ name, data (base64) }] }: saves the request (reviewed in the GDE app)
const store = require("./_store");
const { readSession, secret } = require("./_session");
const { collectorStatus } = require("./_collector");
const credits = require("./_credits");

const PER_DAY = 5;

const clean = (value, max) => String(value ?? "").replace(/[<>\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, max);

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 4400000) { reject(Object.assign(new Error("The files are too large together. Send fewer or smaller pictures."), { status: 413 })); request.destroy(); }
    });
    request.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(Object.assign(new Error("Invalid request."), { status: 400 })); } });
    request.on("error", reject);
  });
}

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (!store.configured() || !secret()) return response.status(503).json({ error: "Requests are not set up yet. Please call us instead." });
  const user = readSession(request);
  try {
    if (request.method === "GET") {
      if (!user) return response.status(200).json({ user: null });
      const [status, all] = await Promise.all([collectorStatus(user.email), credits.listRequests()]);
      const requests = all.filter((r) => r.email === user.email).map((r) => ({
        id: r.id, createdAt: r.createdAt, status: r.status, guns: r.guns, gunsCredited: r.gunsCredited || 0,
        where: credits.WHERE[r.where] || r.where
      }));
      return response.status(200).json({ user: { email: user.email, name: user.name }, status, requests });
    }
    if (request.method !== "POST") return response.status(405).json({ error: "Use POST." });
    if (!/^application\/json\b/i.test(String(request.headers["content-type"] || ""))) return response.status(415).json({ error: "Send JSON." });
    if (!user) return response.status(401).json({ error: "Please sign in first, so we know which account to add the guns to." });

    const key = `gde:rl:creditreq:${user.email}`;
    const [, count] = await store.pipeline([["SET", key, 0, "EX", 86400, "NX"], ["INCR", key]]);
    if (count > PER_DAY) return response.status(429).json({ error: "That's a lot of requests for one day. Please call us instead." });

    const body = await readBody(request);
    const where = Object.hasOwn(credits.WHERE, body.where) ? body.where : null;
    const guns = Math.round(Number(body.guns));
    const record = {
      email: user.email,
      name: clean(body.name, 100) || user.name || "",
      phone: clean(body.phone, 40),
      where,
      whereOther: clean(body.whereOther, 120),
      when: clean(body.when, 40),
      guns,
      which: clean(body.which, 1000),
      explanation: clean(body.explanation, 3000)
    };
    if (!where) return response.status(400).json({ error: "Tell us where you bought the gun." });
    if (where === "other" && !record.whereOther) return response.status(400).json({ error: "Tell us where you bought the gun." });
    if (!(guns >= 1 && guns <= 20)) return response.status(400).json({ error: "How many guns? Enter a number from 1 to 20." });
    if (!record.which) return response.status(400).json({ error: "Tell us which gun or guns you bought." });

    const files = [];
    for (const f of (Array.isArray(body.files) ? body.files : []).slice(0, credits.MAX_FILES + 1)) {
      if (files.length >= credits.MAX_FILES) return response.status(400).json({ error: `Up to ${credits.MAX_FILES} files, please.` });
      const buffer = Buffer.from(String(f?.data || ""), "base64");
      const type = credits.sniff(buffer);
      const name = clean(f?.name, 120) || "file";
      if (!type) return response.status(400).json({ error: `${name} isn't a picture or a PDF.` });
      if (buffer.length > credits.MAX_FILE_BYTES) return response.status(400).json({ error: `${name} is too large. Send a photo or screenshot of it instead.` });
      files.push({ name, type, buffer });
    }
    if (!files.length) return response.status(400).json({ error: "Add at least one receipt or photo as proof." });

    const saved = await credits.saveRequest(record, files);
    return response.status(200).json({ ok: true, id: saved.id });
  } catch (error) {
    if (!error.status) console.error(error);
    return response.status(error.status || 500).json({ error: error.status ? error.message : "Something went wrong. Please try again or call us." });
  }
};
