// The small online store (Upstash Redis, added to this Vercel project) that links the website to the
// GDE inventory app on the shop's computer:
//   gde:catalog         prices and stock the app sends (JSON: { updated, listings: { <listing>: { price, soldOut } } })
//   gde:order:<invoice> each checkout, with everything the buyer filled in and the payment once it is seen
//   gde:orders          the invoice numbers, newest first
//   gde:message:<id>    each Contact page message (api/contact.js); gde:messages the ids, newest first
// Files starting with "_" in api/ are helpers, not web addresses.
// Vercel's Upstash integration sets KV_REST_API_URL / KV_REST_API_TOKEN (older ones UPSTASH_REDIS_REST_*).

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const configured = () => !!(URL_ && TOKEN);

async function call(pathname, body) {
  if (!configured()) throw new Error("The order store is not set up in Vercel yet.");
  const response = await fetch(URL_.replace(/\/$/, "") + pathname, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) throw new Error(`Order store: ${result.error || response.status}`);
  return result;
}

// One command, e.g. cmd("GET", "gde:catalog").
const cmd = async (...args) => (await call("", args)).result;
// Several commands in one trip; returns their results in order.
const pipeline = async (commands) => (await call("/pipeline", commands)).map((r) => {
  if (r.error) throw new Error(`Order store: ${r.error}`);
  return r.result;
});

const parse = (value) => {
  try { return value ? JSON.parse(value) : null; } catch { return null; }
};

async function getCatalog() {
  if (!configured()) return null;
  return parse(await cmd("GET", "gde:catalog"));
}

async function saveOrder(order, isNew) {
  const commands = [["SET", `gde:order:${order.invoice}`, JSON.stringify(order)]];
  if (isNew) commands.push(["LPUSH", "gde:orders", order.invoice]);
  await pipeline(commands);
}

async function listOrders(limit = 1000) {
  const invoices = await cmd("LRANGE", "gde:orders", 0, limit - 1);
  if (!invoices.length) return [];
  const values = await cmd("MGET", ...invoices.map((inv) => `gde:order:${inv}`));
  return values.map(parse).filter(Boolean);
}

module.exports = { configured, cmd, pipeline, getCatalog, saveOrder, listOrders };
