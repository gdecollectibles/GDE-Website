// Guns bought from GDE outside the website (in person, by phone, at a gun show, on a marketplace), so they count
// toward the collector tiers (user, Nov 12, 2026). A signed-in customer sends a request with proof on
// collector-request.html (api/collector-request.js); the owner checks it in the inventory app's Website tab
// (Collector requests), which approves or declines it through /api/admin. Approved guns are credited to the account.
// Stored next to the orders (see _store.js):
//   gde:creditreq:<id>        one request: { id, createdAt, status: pending|approved|declined, email, name, phone, where,
//                             whereOther, when, guns, which, explanation, files: [{ n, name, type, size }], decidedAt,
//                             gunsCredited, decisionNote }
//   gde:creditreqs            request ids, newest first
//   gde:creditfile:<id>:<n>   one proof file, base64
//   gde:credit:<email>        guns credited to an account: { email, guns, entries: [{ id, guns, note, source, at }] }
//   gde:credits               set of emails with credited guns
const crypto = require("node:crypto");
const store = require("./_store");

const MAX_FILES = 5;
const MAX_FILE_BYTES = 700 * 1024; // kept small so every store write stays well inside the store's request limit
const WHERE = {
  in_person: "In person from GDE",
  phone: "By phone from GDE",
  gun_show: "At a gun show",
  gunbroker: "GunBroker",
  guns_international: "Guns International",
  other: "Somewhere else"
};

const norm = (email) => String(email || "").trim().toLowerCase();
const parse = (value) => { try { return value ? JSON.parse(value) : null; } catch { return null; } };

// What a file really is, from its first bytes (the name and the browser's word for it aren't trusted).
function sniff(buffer) {
  const hex = buffer.subarray(0, 12).toString("hex");
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  if (hex.startsWith("89504e470d0a1a0a")) return "image/png";
  if (hex.startsWith("52494646") && buffer.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buffer.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  return null;
}

async function getCredit(email) {
  email = norm(email);
  if (!email) return null;
  return parse(await store.cmd("GET", `gde:credit:${email}`));
}

async function addCredit(email, guns, note, source) {
  email = norm(email);
  const credit = (await getCredit(email)) || { email, guns: 0, entries: [] };
  const entry = { id: crypto.randomBytes(5).toString("hex"), guns, note: String(note || "").slice(0, 300), source: source || "app", at: new Date().toISOString() };
  credit.entries.push(entry);
  credit.guns = credit.entries.reduce((sum, e) => sum + e.guns, 0);
  await store.pipeline([["SET", `gde:credit:${email}`, JSON.stringify(credit)], ["SADD", "gde:credits", email]]);
  return { credit, entry };
}

async function removeCredit(email, entryId) {
  email = norm(email);
  const credit = await getCredit(email);
  const entry = credit?.entries.find((e) => e.id === entryId);
  if (!entry) return null;
  credit.entries = credit.entries.filter((e) => e !== entry);
  credit.guns = credit.entries.reduce((sum, e) => sum + e.guns, 0);
  await store.pipeline(credit.entries.length
    ? [["SET", `gde:credit:${email}`, JSON.stringify(credit)]]
    : [["DEL", `gde:credit:${email}`], ["SREM", "gde:credits", email]]);
  return entry;
}

async function listCredits() {
  const emails = await store.cmd("SMEMBERS", "gde:credits");
  if (!emails?.length) return [];
  return (await store.cmd("MGET", ...emails.map((e) => `gde:credit:${e}`))).map(parse).filter(Boolean);
}

async function saveRequest(request, files) {
  const id = `CR-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
  const record = { ...request, id, createdAt: new Date().toISOString(), status: "pending",
    files: files.map((f, n) => ({ n, name: f.name, type: f.type, size: f.buffer.length })) };
  // One write per file, so no single call to the store gets large.
  for (const [n, f] of files.entries()) await store.cmd("SET", `gde:creditfile:${id}:${n}`, f.buffer.toString("base64"));
  await store.pipeline([["SET", `gde:creditreq:${id}`, JSON.stringify(record)], ["LPUSH", "gde:creditreqs", id]]);
  return record;
}

async function getRequest(id) {
  if (!/^CR-[A-Z0-9]{6,20}$/.test(String(id || ""))) return null;
  return parse(await store.cmd("GET", `gde:creditreq:${id}`));
}

async function listRequests(limit = 500) {
  const ids = await store.cmd("LRANGE", "gde:creditreqs", 0, limit - 1);
  if (!ids?.length) return [];
  return (await store.cmd("MGET", ...ids.map((id) => `gde:creditreq:${id}`))).map(parse).filter(Boolean);
}

async function getFile(id, n) {
  const request = await getRequest(id);
  const meta = request?.files?.find((f) => f.n === Number(n));
  if (!meta) return null;
  const data = await store.cmd("GET", `gde:creditfile:${id}:${meta.n}`);
  return data ? { ...meta, data } : null;
}

// approved: credits `guns` to the account (0 is allowed: approved but nothing added). Only pending requests are decided,
// so a request can't credit twice; removing its credit (removeCredit) puts it back to pending.
async function decide(id, decision, guns, note) {
  const request = await getRequest(id);
  if (!request) throw Object.assign(new Error("No such request."), { status: 404 });
  if (request.status !== "pending") throw Object.assign(new Error(`This request was already ${request.status}.`), { status: 409 });
  if (!["approved", "declined"].includes(decision)) throw Object.assign(new Error("Approve or decline."), { status: 400 });
  let entry = null;
  if (decision === "approved" && guns > 0) {
    ({ entry } = await addCredit(request.email, guns, note || `${WHERE[request.where] || request.where}${request.when ? `, ${request.when}` : ""}`, request.id));
  }
  Object.assign(request, { status: decision, decidedAt: new Date().toISOString(), gunsCredited: decision === "approved" ? guns : 0,
    decisionNote: String(note || "").slice(0, 300), creditEntry: entry?.id || null });
  await store.cmd("SET", `gde:creditreq:${id}`, JSON.stringify(request));
  return request;
}

async function reopen(id) {
  const request = await getRequest(id);
  if (!request) return;
  Object.assign(request, { status: "pending", decidedAt: null, gunsCredited: 0, creditEntry: null });
  await store.cmd("SET", `gde:creditreq:${id}`, JSON.stringify(request));
}

module.exports = { MAX_FILES, MAX_FILE_BYTES, WHERE, norm, sniff, getCredit, addCredit, removeCredit, listCredits,
  saveRequest, getRequest, listRequests, getFile, decide, reopen };
