// Unsubscribe from GDE's emails, no sign-in needed (user, Nov 15). Every email the inventory app sends carries the
// person's own signed link (_subscribers.js):
//   POST /api/unsubscribe?e=..&t=..   body "List-Unsubscribe=One-Click": Gmail/Yahoo's one-click button (RFC 8058)
//   POST /api/unsubscribe             JSON { e, t, resubscribe? }: the unsubscribe page (unsubscribe.html)
// Saves status "unsubscribed" (or "subscribed" again) on the person's record; the inventory app pulls it within a few
// minutes and sets unsubscribed_at, so later sends skip them. Works for past buyers who never made an account.
const store = require("./_store");
const { CONSENT, getSubscriber, saveSubscriber, readUnsub } = require("./_subscribers");

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; if (body.length > 4000) { reject(new Error("Too large.")); request.destroy(); } });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

const mask = (email) => email.replace(/^(.).*?(.)?@/, (m, a, b) => `${a}${"•".repeat(4)}${b || ""}@`);

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Robots-Tag", "noindex");
  if (request.method !== "POST") return response.status(405).json({ error: "Use the link in the email." });
  if (!store.configured()) return response.status(503).json({ error: "Please try again later, or reply to the email and we'll take you off." });
  try {
    const query = new URL(request.url, "http://x").searchParams;
    const raw = await readBody(request);
    const type = String(request.headers["content-type"] || "");
    let e = query.get("e"), t = query.get("t"), resubscribe = false;
    if (/^application\/json\b/i.test(type)) {
      const body = JSON.parse(raw || "{}");
      e = body.e || e; t = body.t || t; resubscribe = body.resubscribe === true;
    }
    const email = readUnsub(e, t);
    if (!email) return response.status(400).json({ error: "This link isn't valid. Reply to the email and we'll take you off by hand." });

    const old = await getSubscriber(email);
    if (resubscribe) {
      await saveSubscriber(email, {
        status: "subscribed", source: old?.source || "email",
        consent: { text: CONSENT, at: new Date().toISOString(), page: "/unsubscribe (resubscribed)" }
      });
    } else if (old?.status !== "unsubscribed") {
      await saveSubscriber(email, { status: "unsubscribed", unsubscribedAt: new Date().toISOString(), source: old?.source || "email" });
    }
    return response.status(200).json({ ok: true, email: mask(email), status: resubscribe ? "subscribed" : "unsubscribed" });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: "Something went wrong. Reply to the email and we'll take you off by hand." });
  }
};
