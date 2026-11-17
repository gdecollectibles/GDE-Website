// Sends the site's own emails (sign-up and password-reset codes) through Resend (resend.com).
// Needs in Vercel: RESEND_API_KEY. Optional: MAIL_FROM (default "GDE Collectibles <account@gdecollectibles.com>"; the
// domain must be verified in Resend, DNS records at Hostinger) and MAIL_REPLY_TO (default info@gdecollectibles.com).
const FROM = () => process.env.MAIL_FROM || "GDE Collectibles <account@gdecollectibles.com>";
const REPLY_TO = () => process.env.MAIL_REPLY_TO || "info@gdecollectibles.com";

const configured = () => !!process.env.RESEND_API_KEY;

async function send({ to, subject, text, html }) {
  if (!configured()) throw Object.assign(new Error("Email sign-up isn't available yet. Please continue with Google."), { status: 503 });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM(), to: [to], reply_to: REPLY_TO(), subject, text, html })
  });
  if (!response.ok) {
    console.error("Resend", response.status, await response.text().catch(() => ""));
    throw Object.assign(new Error("We couldn't send the email. Please try again in a minute."), { status: 502 });
  }
}

// The 6-digit code email, for "create account" and "forgot password".
function sendCode(to, code, purpose) {
  const what = purpose === "reset" ? "reset your password" : "finish creating your account";
  const subject = purpose === "reset" ? `${code} is your GDE password reset code` : `${code} is your GDE Collectibles code`;
  const text = `Your code is ${code}\n\nEnter it on gdecollectibles.com to ${what}. It works for 15 minutes.\n\nIf you didn't ask for this, you can ignore this email.\n\nGDE Collectibles`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:460px;margin:0 auto;padding:32px 24px;color:#111">
    <p style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#777;margin:0 0 18px">GDE Collectibles</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 22px">Enter this code on gdecollectibles.com to ${what}:</p>
    <p style="font-size:34px;letter-spacing:.3em;font-weight:bold;margin:0 0 22px">${code}</p>
    <p style="font-size:13px;line-height:1.6;color:#777;margin:0">It works for 15 minutes. If you didn't ask for this, you can ignore this email.</p>
  </div>`;
  return send({ to, subject, text, html });
}

// ---- the welcome email, sent once when someone first makes an account (email code or Google; account.js, Nov 17)
// An account email (from account@): it opens with the account, so it stays an account email, not a promotion.
// "New collections first" (user, Nov 17: updates on new collections, discounts): people who ticked "Email me" are told
// they'll get them, with a link to stop; everyone else is shown where to turn on Email Alerts (account page).
const SITE = "https://www.gdecollectibles.com"; // www: the bare domain answers with a redirect first
function welcomeEmail(firstName, { subscribed = false, unsubUrl = "" } = {}) {
  const name = escHtml(String(firstName || "").trim()) || "there";
  const stop = subscribed && unsubUrl ? unsubUrl : "";
  const newsText = subscribed
    ? "You're on our collector list, so you'll be the first to know when a new collection is released, along with limited editions, discounts and collector offers."
    : `Want to be the first to know when a new collection is released, and hear about discounts and collector offers? Turn on Email Alerts in your account: ${SITE}/account`;
  const subject = "Welcome to GDE Collectibles";
  // Design C, "Letter" (user picked it Nov 17; previews and history in clients/gde/docs/email-templates/): ivory and
  // gold, gold logo, "Your membership" box I-IV, gold button, contact rows, RP signature. Images live on the site in
  // assets/email/. Gmail drops a shorthand td background, so the button colour is set as bgcolor + background-color.
  const GOLD = "#a9864a", INK = "#2b2a27", SOFT = "#55524b", MUTED = "#8a857a", LINE = "#e3dccd";
  const SERIF = "Georgia,'Times New Roman',serif";
  const p = (s) => `<p style="margin:0 0 18px;font-family:${SERIF};font-size:17px;line-height:1.7;color:${INK}">${s}</p>`;
  const perk = (n, title, s) => `<tr><td valign="top" style="padding:0 14px 16px 0;font-family:Gloock,${SERIF};font-size:20px;line-height:1.2;color:${GOLD}">${n}</td>
      <td style="padding:0 0 16px"><p style="margin:0 0 4px;font-family:${SERIF};font-size:12px;font-weight:700;line-height:1.4;letter-spacing:.16em;text-transform:uppercase;color:${INK}">${title}</p>
      <p style="margin:0;font-family:${SERIF};font-size:15px;line-height:1.6;color:${SOFT}">${s}</p></td></tr>`;
  const row = (label, href, value) => `<tr><td style="padding:9px 0;border-bottom:1px solid ${LINE};font-family:${SERIF};font-size:11px;line-height:1.5;letter-spacing:.16em;text-transform:uppercase;color:${MUTED}">${label}</td>
      <td align="right" style="padding:9px 0;border-bottom:1px solid ${LINE};font-family:${SERIF};font-size:15px;line-height:1.5"><a href="${href}" style="color:${INK};text-decoration:none">${value}</a></td></tr>`;
  const link = (href, label) => `<a href="${href}" style="color:${INK}">${label}</a>`;
  const news = subscribed
    ? "You're on our collector list, so you'll be the first to know when a new collection is released, along with limited editions, discounts and collector offers."
    : `Want to be the first to know when a new collection is released, and hear about discounts and collector offers? ${link(`${SITE}/account`, "Turn on Email Alerts")} in your account.`;
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only">
<title>${subject}</title>
<style>@media (max-width:620px){.wrap{padding:0!important} .card{border-radius:0!important} .pad{padding-left:24px!important;padding-right:24px!important} .btn{padding:16px 18px!important;letter-spacing:.14em!important}}</style>
</head><body style="margin:0;padding:0;background:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background-color:#ffffff"><tr><td class="wrap" align="center" style="padding:32px 12px">
<table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f7f4ed" style="width:100%;max-width:600px;background-color:#f7f4ed;border:1px solid #d4ccbd;border-radius:4px">
<tr><td style="padding:10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE}">
  <tr><td align="center" style="padding:40px 40px 6px"><img src="${SITE}/assets/email/welcome-logo-gold.png" width="170" alt="GDE Collectibles" style="display:block;width:170px;height:auto;border:0"></td></tr>
  <tr><td class="pad" style="padding:20px 52px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 26px"><tr><td style="border-top:1px solid ${GOLD};width:45%"></td><td align="center" style="font-family:${SERIF};font-size:12px;line-height:1;color:${GOLD};padding:0 10px;white-space:nowrap">&#9670;</td><td style="border-top:1px solid ${GOLD};width:45%"></td></tr></table>
    ${p(`Dear ${name},`)}
    ${p("Welcome to GDE Collectibles, and thank you for joining us. Your account is ready.")}
    ${p("We're a family-owned shop, and every gun we make is a limited, numbered piece. Being part of our community comes with a few things worth knowing:")}
  </td></tr>
  <tr><td class="pad" style="padding:6px 52px 4px"><div style="border:1px solid #d4ccbd;background-color:#fbf9f4;padding:24px 24px 8px">
    <p style="margin:0 0 18px;font-family:${SERIF};font-size:11px;line-height:1;letter-spacing:.3em;text-transform:uppercase;color:${GOLD}">Your membership</p>
    <table role="presentation" cellpadding="0" cellspacing="0">
    ${perk("I", "Follow your orders", "Every order you place shows in your account, from payment until your gun ships to your FFL dealer.")}
    ${perk("II", "Collectors Club", "Your third gun puts you in the Collectors Club: 5% off every gun after it. At five guns you join the Legacy Club: 10% off, plus a code that gives your friends and family 5% off.")}
    ${perk("III", "Piece Unique", `Want something one of a kind? ${link(`${SITE}/piece-unique`, "Tell us your idea")} and we'll design it with you.`)}
    ${perk("IV", "New collections first", news)}
    </table></div></td></tr>
  <tr><td class="pad" style="padding:28px 52px 0">
    ${p("Every gun is made to order and ships to the licensed FFL dealer of your choice. Shipping and insurance are included.")}
  </td></tr>
  <tr><td align="center" style="padding:8px 52px 34px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${GOLD}" style="background-color:${GOLD}">
    <a class="btn" href="${SITE}/collections" style="display:inline-block;padding:16px 28px;white-space:nowrap;background-color:${GOLD};border:1px solid ${GOLD};font-family:Georgia,serif;font-size:12px;font-weight:700;line-height:12px;letter-spacing:.2em;text-transform:uppercase;color:#ffffff;text-decoration:none">See the collections</a></td></tr></table></td></tr>
  <tr><td class="pad" style="padding:0 52px">
    ${p("We're always happy to talk with our community. Whether it's a question about a gun, a number or your dealer, or you just want to say hello, reach out any way you like:")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border-top:1px solid ${LINE}">
    ${row("Call or text", "tel:+17869313566", "1-786-931-3566")}
    ${row("WhatsApp", "https://wa.me/17869313566", "1-786-931-3566")}
    ${row("Email", "mailto:info@gdecollectibles.com", "info@gdecollectibles.com")}
    ${row("Instagram", "https://www.instagram.com/gdecollectibles/", "@gdecollectibles")}
    ${row("Facebook", "https://www.facebook.com/gdecollectibles", "GDE Collectibles")}
    </table>
    ${p("We'd love to hear from you.")}
    <p style="margin:0 0 4px;font-family:${SERIF};font-size:17px;font-style:italic;line-height:1.7;color:${INK}">With gratitude,</p>
    <img src="${SITE}/assets/email/welcome-signature.png" width="140" alt="RP" style="display:block;width:140px;height:auto;border:0;margin:4px 0">
    <p style="margin:0 0 36px;font-family:${SERIF};font-size:15px;line-height:1.6;color:${SOFT}">The GDE Collectibles family</p>
  </td></tr>
  <tr><td class="pad" style="padding:20px 52px 30px;border-top:1px solid ${LINE};font-family:${SERIF};font-size:12px;line-height:1.6;color:${MUTED}">
    Family owned · Gun Decor Emporium LLC · <a href="${SITE}" style="color:${MUTED}">gdecollectibles.com</a><br>
    You're getting this because you just created an account on gdecollectibles.com. <a href="${SITE}/account" style="color:${MUTED}">Your account</a>${stop ? ` · <a href="${escHtml(stop)}" style="color:${MUTED}">Stop update emails</a>` : ""}</td></tr>
</table></td></tr>
</table>
</td></tr></table></body></html>`;
  const text = `Dear ${String(firstName || "").trim() || "there"},

Welcome to GDE Collectibles, and thank you for joining us. Your account is ready.

We're a family-owned shop, and every gun we make is a limited, numbered piece. Being part of our community comes with a few things worth knowing:

- Follow your orders: every order you place shows in your account, from payment until your gun ships to your FFL dealer.
- Collectors Club: your third gun puts you in the Collectors Club, 5% off every gun after it. At five guns you join the Legacy Club: 10% off, plus a code that gives your friends and family 5% off.
- Piece Unique: want something one of a kind? Tell us your idea and we'll design it with you: ${SITE}/piece-unique
- New collections first: ${newsText}

Every gun is made to order and ships to the licensed FFL dealer of your choice. Shipping and insurance are included.

See the collections: ${SITE}/collections

We're always happy to talk with our community. Whether it's a question about a gun, a number or your dealer, or you just want to say hello, reach out any way you like:

- Call or text: 1-786-931-3566
- WhatsApp: 1-786-931-3566
- Email: reply to this email, or info@gdecollectibles.com
- Instagram: @gdecollectibles
- Facebook: facebook.com/gdecollectibles

We'd love to hear from you.

With gratitude,
The GDE Collectibles family

--
Family owned · Gun Decor Emporium LLC · gdecollectibles.com
You're getting this because you just created an account on gdecollectibles.com.${stop ? `\nStop update emails: ${stop}` : ""}`;
  return { subject, html, text };
}

// Sends it; a failed welcome email never stops the sign-up.
async function sendWelcome(to, firstName, list = {}) {
  if (!configured()) return false;
  try { await send({ to, ...welcomeEmail(firstName, list) }); return true; }
  catch (e) { console.error("Welcome email", to, e.message); return false; }
}

// ---- customer emails sent from the inventory app (admin.js "send-email", user Nov 15)
// From news@ (a Workspace alias; replies go to info@). MAIL_FROM_NEWS in Vercel can change it.
const NEWS_FROM = () => process.env.MAIL_FROM_NEWS || "GDE Collectibles <news@gdecollectibles.com>";
const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// The message the app wrote (plain text, blank lines between paragraphs; {first_name} is filled in), an optional
// button, then the footer the law needs: who it's from, GDE's mailing address and the person's unsubscribe link.
function customerEmail({ subject, body, buttonText, buttonLink, address, firstName, unsubUrl }) {
  const name = String(firstName || "").trim();
  const filled = String(body || "").replace(/\{first_name\}/g, name || "there").replace(/\r/g, "").trim();
  const paras = filled.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const link = /^https:\/\/[^\s"<>]+$/.test(String(buttonLink || "")) ? buttonLink : "";
  const button = buttonText && link
    ? `<p style="margin:30px 0 8px"><a href="${escHtml(link)}" style="display:inline-block;padding:14px 26px;background:#111;color:#fff;text-decoration:none;border-radius:10px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;font-weight:bold">${escHtml(buttonText)}</a></p>` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5">
<div style="max-width:560px;margin:0 auto;padding:36px 24px;font-family:Arial,Helvetica,sans-serif;color:#111">
  <p style="font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#777;margin:0 0 26px">GDE Collectibles</p>
  ${paras.map((p) => `<p style="font-size:15px;line-height:1.65;margin:0 0 16px">${escHtml(p).replace(/\n/g, "<br>")}</p>`).join("\n  ")}
  ${button}
  <hr style="border:0;border-top:1px solid #ddd;margin:36px 0 18px">
  <p style="font-size:12px;line-height:1.6;color:#777;margin:0">GDE Collectibles · ${escHtml(address)}<br>
  You're getting this because you bought from GDE Collectibles or joined our list.
  <a href="${escHtml(unsubUrl)}" style="color:#777">Unsubscribe</a></p>
</div></body></html>`;
  const text = `${paras.join("\n\n")}${button ? `\n\n${buttonText}: ${link}` : ""}\n\n--\nGDE Collectibles · ${address}\nYou're getting this because you bought from GDE Collectibles or joined our list.\nUnsubscribe: ${unsubUrl}`;
  return { subject: String(subject || "").slice(0, 200), html, text };
}

// Up to 100 emails in one call (Resend's batch). Returns Resend's ids, in order.
async function sendBatch(emails) {
  if (!configured()) throw Object.assign(new Error("RESEND_API_KEY is not set in Vercel."), { status: 503 });
  const response = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(emails.map((e) => ({ from: NEWS_FROM(), reply_to: REPLY_TO(), ...e })))
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Resend batch", response.status, JSON.stringify(result).slice(0, 500));
    throw Object.assign(new Error(`Resend refused the emails: ${result.message || response.status}`), { status: 502 });
  }
  return (result.data || []).map((d) => d.id);
}

module.exports = { configured, send, sendCode, welcomeEmail, sendWelcome, customerEmail, sendBatch };
