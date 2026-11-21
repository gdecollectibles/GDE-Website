// Sends the site's own emails (sign-up and password-reset codes) through Resend (resend.com).
// Needs in Vercel: RESEND_API_KEY. Optional: MAIL_FROM (default "GDE Collectibles <account@gdecollectibles.com>"; the
// domain must be verified in Resend, DNS records at Hostinger) and MAIL_REPLY_TO (default info@gdecollectibles.com).
const FROM = () => process.env.MAIL_FROM || "GDE Collectibles <account@gdecollectibles.com>";
const REPLY_TO = () => process.env.MAIL_REPLY_TO || "info@gdecollectibles.com";

const configured = () => !!process.env.RESEND_API_KEY;

async function send({ to, subject, text, html, headers }) {
  if (!configured()) throw Object.assign(new Error("Email sign-up isn't available yet. Please continue with Google."), { status: 503 });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM(), to: [to], reply_to: REPLY_TO(), subject, text, html, ...(headers ? { headers } : {}) })
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
// Three versions (user, Nov 17: "send the email to everyone that signed up", accounts + email list):
//   new account (account.js, at sign-up) | existing: true, an account made before the welcome email existed |
//   account: false, someone only on the email list: a marketing email by law, so it carries GDE's mailing address and
//   an Unsubscribe link, and invites them to make an account instead of saying theirs is ready.
const SITE = "https://www.gdecollectibles.com"; // www: the bare domain answers with a redirect first
// offer: the welcome offer (_welcome.js, Nov 17: $100 off a first purchase for 30 days), shown as a gift box under
// the greeting, with the code; it also goes in the subject.
function welcomeEmail(firstName, { subscribed = false, unsubUrl = "", account = true, existing = false, address = "", offer = null } = {}) {
  const name = escHtml(String(firstName || "").trim()) || "there";
  const listOnly = !account;
  if (listOnly) subscribed = true; // only people on the list get this version
  // With the offer it's a marketing email whatever they ticked: always an unsubscribe link (and the address, below).
  const stop = (subscribed || offer) && unsubUrl ? unsubUrl : "";
  const stopLabel = listOnly || (offer && !subscribed) ? "Unsubscribe" : "Stop update emails";
  const hello = listOnly ? "Welcome to GDE Collectibles, and thank you for joining our collector list."
    : existing ? "Welcome to GDE Collectibles, and thank you for joining us."
    : "Welcome to GDE Collectibles, and thank you for joining us. Your account is ready.";
  const why = listOnly ? "You're getting this because you joined the GDE Collectibles email list."
    : existing ? "You're getting this because you have an account on gdecollectibles.com."
    : "You're getting this because you just created an account on gdecollectibles.com.";
  const addr = String(address || "").trim();
  const newsText = subscribed
    ? "You're on our collector list, so you'll be the first to know when a new collection is released, along with limited editions, discounts and collector offers."
    : `Want to be the first to know when a new collection is released, and hear about discounts and collector offers? Turn on Email Alerts in your account: ${SITE}/account`;
  const giftAmount = offer ? `$${Number(offer.amount).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "";
  const giftUntil = offer ? new Date(offer.endsAt).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric" }) : "";
  const giftHow = offer ? `Enter it at checkout by ${giftUntil}. It works once, on your first gun, with this email address.` : "";
  const subject = offer ? `Welcome to GDE Collectibles: ${giftAmount} off your first gun` : "Welcome to GDE Collectibles";
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
    ${p(hello)}
    ${offer ? `<div style="margin:4px 0 24px;border:1px solid ${GOLD};background-color:#fbf9f4;padding:22px 20px;text-align:center">
      <p style="margin:0 0 10px;font-family:${SERIF};font-size:11px;line-height:1;letter-spacing:.3em;text-transform:uppercase;color:${GOLD}">Your welcome gift</p>
      <p style="margin:0 0 14px;font-family:Gloock,${SERIF};font-size:26px;line-height:1.25;color:${INK}">${giftAmount} off your first gun</p>
      <p style="margin:0 0 14px"><span style="display:inline-block;padding:10px 18px;border:1px dashed ${GOLD};font-family:'Courier New',monospace;font-size:20px;font-weight:700;letter-spacing:.12em;color:${INK}">${escHtml(offer.code)}</span></p>
      <p style="margin:0;font-family:${SERIF};font-size:14px;line-height:1.6;color:${SOFT}">${giftHow}</p></div>` : ""}
    ${p("We're a family-owned shop, and every gun we make is a limited, numbered piece. Being part of our community comes with a few things worth knowing:")}
  </td></tr>
  <tr><td class="pad" style="padding:6px 52px 4px"><div style="border:1px solid #d4ccbd;background-color:#fbf9f4;padding:24px 24px 8px">
    <p style="margin:0 0 18px;font-family:${SERIF};font-size:11px;line-height:1;letter-spacing:.3em;text-transform:uppercase;color:${GOLD}">Your membership</p>
    <table role="presentation" cellpadding="0" cellspacing="0">
    ${listOnly
      ? perk("I", "Your own account", `${link(`${SITE}/account`, "Create a free account")} to follow every order, from payment until your gun ships to your FFL dealer.`)
      : perk("I", "Follow your orders", "Every order you place shows in your account, from payment until your gun ships to your FFL dealer.")}
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
    Family owned · Gun Decor Emporium LLC${addr ? ` · ${escHtml(addr)}` : ""} · <a href="${SITE}" style="color:${MUTED}">gdecollectibles.com</a><br>
    ${why}${listOnly ? "" : ` <a href="${SITE}/account" style="color:${MUTED}">Your account</a>`}${stop ? `${listOnly ? " " : " · "}<a href="${escHtml(stop)}" style="color:${MUTED}">${stopLabel}</a>` : ""}</td></tr>
</table></td></tr>
</table>
</td></tr></table></body></html>`;
  const text = `Dear ${String(firstName || "").trim() || "there"},

${hello}
${offer ? `
YOUR WELCOME GIFT: ${giftAmount} off your first gun
Code: ${offer.code}
${giftHow}
` : ""}
We're a family-owned shop, and every gun we make is a limited, numbered piece. Being part of our community comes with a few things worth knowing:

${listOnly
  ? `- Your own account: create a free account to follow every order, from payment until your gun ships to your FFL dealer: ${SITE}/account`
  : "- Follow your orders: every order you place shows in your account, from payment until your gun ships to your FFL dealer."}
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
Family owned · Gun Decor Emporium LLC${addr ? ` · ${addr}` : ""} · gdecollectibles.com
${why}${stop ? `\n${stopLabel}: ${stop}` : ""}`;
  return { subject, html, text };
}

// Sends it; a failed welcome email never stops the sign-up.
async function sendWelcome(to, firstName, list = {}) {
  if (!configured()) return false;
  // One-click unsubscribe header too (list.oneClick, _subscribers.js), like the CRM emails, whenever there's a link.
  const headers = list.oneClick && list.unsubUrl && (list.subscribed || list.offer)
    ? { "List-Unsubscribe": `<${list.oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined;
  try { await send({ to, ...welcomeEmail(firstName, list), headers }); return true; }
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

// ---- Black Friday "sale ends" email (user, Nov 20: "an email with a live tracker" for the people signed up)
// A marketing email (from news@ like the CRM emails): mailing address + Unsubscribe in the footer, one-click header
// when sent. Same "Letter" look as the welcome and order emails. The countdown is a picture drawn fresh at every open
// (api/countdown.js). guns: up to 3 of { name, url, photo, price } (price a number), shown with the crossed-out
// "was" price the website shows (price ÷ 0.9, to the nearest $100; see SALE in script.js).
const SALE_END = "2026-11-28T00:00:00-05:00"; // midnight after Black Friday, Miami time (same as script.js)
// Nov 21 (user): "Black Friday" made the big headline, logo black, dealer line says "in the US".
// logoSrc / countdownSrc: only for local previews (make_black_friday.js) before the files are on the live site.
function saleEndEmail({ firstName, address, unsubUrl, guns = [], countdownSrc, logoSrc } = {}) {
  const name = escHtml(String(firstName || "").trim()) || "there";
  const addr = String(address || "").trim();
  const subject = "Black Friday: 10% off ends Friday at midnight";
  const preheader = "Every gun is 10% off until midnight on Friday, November 27. No code needed.";
  const clock = countdownSrc || `${SITE}/api/countdown?to=${encodeURIComponent(SALE_END)}`;
  const money = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
  const was = (n) => money(Math.round(n / 0.9 / 100) * 100);
  const GOLD = "#a9864a", INK = "#2b2a27", SOFT = "#55524b", MUTED = "#8a857a", LINE = "#e3dccd";
  const SERIF = "Georgia,'Times New Roman',serif";
  const p = (s) => `<p style="margin:0 0 18px;font-family:${SERIF};font-size:17px;line-height:1.7;color:${INK}">${s}</p>`;
  const label = (s) => `<p style="margin:0 0 14px;font-family:${SERIF};font-size:11px;line-height:1;letter-spacing:.3em;text-transform:uppercase;color:${GOLD}">${s}</p>`;
  // Guns: look B "cards with savings" (user, Nov 21; options in docs/email-templates/gun-section-options.html): each in
  // a white card with "Colt · <caliber>" in gold, the name on one line (row runs wider than the text so "Remember the
  // Alamo" fits; on phones the cards stack, one per row), was/now side by side, bold sale price (Nov 21), "Save $300", View link.
  const shown = guns.slice(0, 3);
  const saved = (n) => money(Math.round(n / 0.9 / 100) * 100 - n);
  const gunCells = shown.map((g) => `<td class="gun" valign="top" width="${Math.floor(100 / shown.length)}%" style="padding:0 4px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid ${LINE};padding:8px 8px 16px;text-align:center">
      <a href="${escHtml(g.url)}"><img src="${escHtml(g.photo)}" width="160" class="gimg" alt="${escHtml(g.name)}" style="display:block;width:100%;max-width:160px;height:auto;border:0;margin:0 auto 12px"></a>
      ${g.caliber ? `<p style="margin:0 0 6px;font-family:${SERIF};font-size:10px;line-height:1.3;letter-spacing:.22em;text-transform:uppercase;color:${GOLD}">Colt · ${escHtml(g.caliber)}</p>` : ""}
      <p class="gname" style="margin:0 0 4px;font-family:Gloock,${SERIF};font-size:15px;line-height:1.3;white-space:nowrap;color:${INK}"><a href="${escHtml(g.url)}" style="color:${INK};text-decoration:none">${escHtml(g.name)}</a></p>
      <p style="margin:6px 0;font-family:${SERIF};font-size:14px;line-height:1.4;color:${INK}"><s style="color:${MUTED};font-size:12px">${was(g.price)}</s>&nbsp; <b style="font-weight:700">${money(g.price)}</b></p>
      <p style="margin:0 0 12px;font-family:${SERIF};font-size:11px;line-height:1.4;letter-spacing:.12em;text-transform:uppercase;color:${GOLD}">Save ${saved(g.price)}</p>
      <a href="${escHtml(g.url)}" style="font-family:${SERIF};font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:${INK};text-decoration:underline">View</a>
      </td></tr></table></td>`).join("");
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only">
<title>${subject}</title>
<style>@media (max-width:620px){.wrap{padding:0!important} .card{border-radius:0!important} .pad{padding-left:24px!important;padding-right:24px!important} .btn{padding:16px 18px!important;letter-spacing:.14em!important} .h1{font-size:22px!important} .bf{font-size:38px!important;letter-spacing:.03em!important} .gun{display:block!important;width:100%!important;padding:0 0 12px!important} .gunrow{padding-left:24px!important;padding-right:24px!important} .gimg{max-width:280px!important}}</style>
</head><body style="margin:0;padding:0;background:#ffffff">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background-color:#ffffff"><tr><td class="wrap" align="center" style="padding:32px 12px">
<table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f7f4ed" style="width:100%;max-width:600px;background-color:#f7f4ed;border:1px solid #d4ccbd;border-radius:4px">
<tr><td style="padding:10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE}">
  <tr><td align="center" style="padding:40px 40px 6px"><img src="${escHtml(logoSrc || `${SITE}/assets/email/welcome-logo-black.png`)}" width="170" alt="GDE Collectibles" style="display:block;width:170px;height:auto;border:0"></td></tr>
  <tr><td class="pad" style="padding:20px 52px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 26px"><tr><td style="border-top:1px solid ${GOLD};width:45%"></td><td align="center" style="font-family:${SERIF};font-size:12px;line-height:1;color:${GOLD};padding:0 10px;white-space:nowrap">&#9670;</td><td style="border-top:1px solid ${GOLD};width:45%"></td></tr></table>
    <h1 class="bf" style="margin:0 0 14px;text-align:center;font-family:Gloock,${SERIF};font-size:54px;font-weight:400;line-height:1.05;letter-spacing:.04em;text-transform:uppercase;color:#111111">Black Friday</h1>
    <p class="h1" style="margin:0 0 28px;text-align:center;font-family:Gloock,${SERIF};font-size:26px;font-weight:400;line-height:1.25;color:${GOLD}">10% off every gun,<br>until midnight Friday</p>
    ${p(`Dear ${name},`)}
    ${p("Our Black Friday sale ends soon. Until midnight on Friday, November 27 (Eastern time), every gun in our collections is 10% off. The prices on our website already include it, so there's no code to enter.")}
  </td></tr>
  <tr><td class="pad" align="center" style="padding:6px 52px 26px">
    ${label("Time left")}
    <a href="${SITE}/collections"><img src="${escHtml(clock)}" width="476" alt="The sale ends at midnight on Friday, November 27, Eastern time" style="display:block;width:100%;max-width:476px;height:auto;border:0"></a>
  </td></tr>
  ${shown.length ? `<tr><td class="gunrow" style="padding:0 14px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${gunCells}</tr></table></td></tr>` : ""}
  <tr><td class="pad" style="padding:22px 52px 0">
    ${p("Every piece is limited and numbered, made to order, and ships to the licensed FFL dealer in the US of your choice. Shipping and insurance are included.")}
  </td></tr>
  <tr><td align="center" style="padding:8px 52px 34px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${GOLD}" style="background-color:${GOLD}">
    <a class="btn" href="${SITE}/collections" style="display:inline-block;padding:16px 28px;white-space:nowrap;background-color:${GOLD};border:1px solid ${GOLD};font-family:Georgia,serif;font-size:12px;font-weight:700;line-height:12px;letter-spacing:.2em;text-transform:uppercase;color:#ffffff;text-decoration:none">Shop the sale</a></td></tr></table></td></tr>
  <tr><td class="pad" style="padding:0 52px">
    ${p(`Questions about a gun, a number or your dealer? Reply to this email, or call or text us at <a href="tel:+17869313566" style="color:${INK}">1-786-931-3566</a>.`)}
    <p style="margin:0 0 4px;font-family:${SERIF};font-size:17px;font-style:italic;line-height:1.7;color:${INK}">With gratitude,</p>
    <img src="${SITE}/assets/email/welcome-signature.png" width="140" alt="RP" style="display:block;width:140px;height:auto;border:0;margin:4px 0">
    <p style="margin:0 0 36px;font-family:${SERIF};font-size:15px;line-height:1.6;color:${SOFT}">The GDE Collectibles family</p>
  </td></tr>
  <tr><td class="pad" style="padding:20px 52px 30px;border-top:1px solid ${LINE};font-family:${SERIF};font-size:12px;line-height:1.6;color:${MUTED}">
    Family owned · Gun Decor Emporium LLC${addr ? ` · ${escHtml(addr)}` : ""} · <a href="${SITE}" style="color:${MUTED}">gdecollectibles.com</a><br>
    You're getting this because you bought from GDE Collectibles or joined our email list. <a href="${escHtml(unsubUrl || "")}" style="color:${MUTED}">Unsubscribe</a></td></tr>
</table></td></tr>
</table>
</td></tr></table></body></html>`;
  const text = `BLACK FRIDAY: 10% off every gun, until midnight Friday

Dear ${String(firstName || "").trim() || "there"},

Our Black Friday sale ends soon. Until midnight on Friday, November 27 (Eastern time), every gun in our collections is 10% off. The prices on our website already include it, so there's no code to enter.
${shown.length ? `\n${shown.map((g) => `- ${g.name}: ${money(g.price)} (was ${was(g.price)}, save ${saved(g.price)}) ${g.url}`).join("\n")}\n` : ""}
Every piece is limited and numbered, made to order, and ships to the licensed FFL dealer in the US of your choice. Shipping and insurance are included.

Shop the sale: ${SITE}/collections

Questions about a gun, a number or your dealer? Reply to this email, or call or text us at 1-786-931-3566.

With gratitude,
The GDE Collectibles family

--
Family owned · Gun Decor Emporium LLC${addr ? ` · ${addr}` : ""} · gdecollectibles.com
You're getting this because you bought from GDE Collectibles or joined our email list.
Unsubscribe: ${unsubUrl || ""}`;
  return { subject, html, text };
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

// ---- the order confirmation email (user, Nov 19; _orderconfirm.js sends it once per paid order)
// From orders@ (a Workspace alias; MAIL_FROM_ORDERS in Vercel can change it), replies to info@. A transactional email:
// no unsubscribe. Same "Letter" design as the welcome email (ivory and gold, gold logo, RP signature).
// guns: the listings (codex-inventory.json products), for each line's photo and details; missing ones are skipped.
const ORDERS_FROM = () => process.env.MAIL_FROM_ORDERS || "GDE Collectibles <orders@gdecollectibles.com>";
const usd = (n) => `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

function orderEmail(order, { guns = {} } = {}) {
  const f = order.form || {};
  const first = String(f.firstName || "").trim();
  const name = escHtml(first) || "there";
  const test = order.environment === "sandbox";
  const items = (order.items || []).map((i) => ({ ...i, gun: guns[i.listing] || null }));
  const subtotal = items.reduce((s, i) => s + (Number(i.listPrice ?? i.price) || 0), 0);
  const total = Number(order.amount) || 0;
  const saved = Math.round((subtotal - total) * 100) / 100;
  const discountName = order.discount?.name || "Discount";
  const when = new Date(order.createdAt || Date.now()).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric" });
  const card = String(order.payment?.card || "").match(/^(\S+)\s+X*(\d{4})$/i);
  const paidWith = card ? `${card[1]} ending in ${card[2]}` : "";
  const ffl = [f.fflBusiness, [f.fflAddress, f.fflAddress2].filter(Boolean).join(", "),
    [f.fflCity, [f.fflState, f.fflZip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].map((s) => String(s || "").trim()).filter(Boolean);
  const many = items.length > 1;
  const subject = `${test ? "[Test] " : ""}Your GDE Collectibles order ${order.invoice}`;

  const GOLD = "#a9864a", INK = "#2b2a27", SOFT = "#55524b", MUTED = "#8a857a", LINE = "#e3dccd";
  const SERIF = "Georgia,'Times New Roman',serif";
  const p = (s) => `<p style="margin:0 0 18px;font-family:${SERIF};font-size:17px;line-height:1.7;color:${INK}">${s}</p>`;
  const label = (s) => `<p style="margin:0 0 16px;font-family:${SERIF};font-size:11px;line-height:1;letter-spacing:.3em;text-transform:uppercase;color:${GOLD}">${s}</p>`;
  const box = (inner) => `<div style="border:1px solid #d4ccbd;background-color:#fbf9f4;padding:24px 24px 18px">${inner}</div>`;
  const sumRow = (l, v, strong) => `<tr><td style="padding:7px 0;font-family:${SERIF};font-size:${strong ? 16 : 14}px;line-height:1.5;color:${strong ? INK : SOFT};${strong ? "font-weight:700;" : ""}">${l}</td>
      <td align="right" style="padding:7px 0;font-family:${SERIF};font-size:${strong ? 16 : 14}px;line-height:1.5;color:${INK};white-space:nowrap;${strong ? "font-weight:700;" : ""}">${v}</td></tr>`;
  const step = (n, title, s) => `<tr><td valign="top" style="padding:0 14px 16px 0;font-family:Gloock,${SERIF};font-size:20px;line-height:1.2;color:${GOLD}">${n}</td>
      <td style="padding:0 0 16px"><p style="margin:0 0 4px;font-family:${SERIF};font-size:12px;font-weight:700;line-height:1.4;letter-spacing:.16em;text-transform:uppercase;color:${INK}">${title}</p>
      <p style="margin:0;font-family:${SERIF};font-size:15px;line-height:1.6;color:${SOFT}">${s}</p></td></tr>`;
  const contact = (l, href, value) => `<tr><td style="padding:9px 0;border-bottom:1px solid ${LINE};font-family:${SERIF};font-size:11px;line-height:1.5;letter-spacing:.16em;text-transform:uppercase;color:${MUTED}">${l}</td>
      <td align="right" style="padding:9px 0;border-bottom:1px solid ${LINE};font-family:${SERIF};font-size:15px;line-height:1.5"><a href="${href}" style="color:${INK};text-decoration:none">${value}</a></td></tr>`;

  const itemHtml = items.map((i, n) => {
    const g = i.gun;
    const photo = g?.photos?.[0] ? `${SITE}/${String(g.photos[0]).replace(/^\//, "")}` : "";
    const facts = g ? [/^1 of \d+$/i.test(g.collectionNumber || "") ? `Limited to ${String(g.collectionNumber).replace(/^1 of /i, "")}` : "", g.model, g.caliber, g.finish].filter(Boolean) : [];
    const pageUrl = `${SITE}/gun/${encodeURIComponent(i.listing || "")}`;
    return `${photo ? `<a href="${pageUrl}"><img src="${escHtml(photo)}" width="476" alt="${escHtml(i.name)}" style="display:block;width:100%;max-width:476px;height:auto;border:0;margin:${n ? "22px" : "0"} 0 14px"></a>` : n ? `<div style="height:14px"></div>` : ""}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td valign="top" style="font-family:Gloock,${SERIF};font-size:21px;line-height:1.3;color:${INK}">${escHtml(i.name)}</td>
      <td valign="top" align="right" style="font-family:${SERIF};font-size:16px;line-height:1.6;color:${INK};white-space:nowrap;padding-left:12px">${usd(i.listPrice ?? i.price)}</td></tr></table>
    ${facts.length ? `<p style="margin:6px 0 0;font-family:${SERIF};font-size:14px;line-height:1.6;color:${SOFT}">${facts.map(escHtml).join(" · ")}</p>` : ""}`;
  }).join("\n");

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only">
<title>${escHtml(subject)}</title>
<style>@media (max-width:620px){.wrap{padding:0!important} .card{border-radius:0!important} .pad{padding-left:24px!important;padding-right:24px!important} .btn{padding:16px 18px!important;letter-spacing:.14em!important}}</style>
</head><body style="margin:0;padding:0;background:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background-color:#ffffff"><tr><td class="wrap" align="center" style="padding:32px 12px">
<table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f7f4ed" style="width:100%;max-width:600px;background-color:#f7f4ed;border:1px solid #d4ccbd;border-radius:4px">
<tr><td style="padding:10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE}">
  <tr><td align="center" style="padding:40px 40px 6px"><img src="${SITE}/assets/email/welcome-logo-gold.png" width="170" alt="GDE Collectibles" style="display:block;width:170px;height:auto;border:0"></td></tr>
  <tr><td class="pad" style="padding:20px 52px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 26px"><tr><td style="border-top:1px solid ${GOLD};width:45%"></td><td align="center" style="font-family:${SERIF};font-size:12px;line-height:1;color:${GOLD};padding:0 10px;white-space:nowrap">&#9670;</td><td style="border-top:1px solid ${GOLD};width:45%"></td></tr></table>
    ${test ? `<p style="margin:0 0 18px;padding:10px 14px;border:1px dashed ${GOLD};font-family:${SERIF};font-size:13px;line-height:1.5;color:${SOFT}">This is a test order. No real payment was taken.</p>` : ""}
    <p style="margin:0 0 6px;font-family:${SERIF};font-size:11px;line-height:1;letter-spacing:.3em;text-transform:uppercase;color:${GOLD}">Order confirmed</p>
    <p style="margin:0 0 24px;font-family:Gloock,${SERIF};font-size:30px;line-height:1.25;color:${INK}">Thank you for your order.</p>
    ${p(`Dear ${name},`)}
    ${p(`Your payment went through and your order is confirmed. We're truly honored that you chose GDE Collectibles, and we'll take great care of ${many ? "your pieces" : "your piece"} from here.`)}
  </td></tr>
  <tr><td class="pad" style="padding:6px 52px 4px">${box(`
    ${label("Your order")}
    <p style="margin:0 0 20px;font-family:${SERIF};font-size:14px;line-height:1.6;color:${SOFT}">Order <b style="color:${INK}">${escHtml(order.invoice)}</b> · ${when}</p>
    ${itemHtml}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;border-top:1px solid ${LINE}">
    ${saved > 0 ? sumRow("Subtotal", usd(subtotal)) + sumRow(escHtml(discountName), `&minus;${usd(saved)}`) : ""}
    ${sumRow("Shipping and insurance", "Included")}
    ${sumRow("Total paid", usd(total), true)}
    </table>
    ${paidWith ? `<p style="margin:6px 0 0;font-family:${SERIF};font-size:13px;line-height:1.6;color:${MUTED}">Paid with ${escHtml(paidWith)}</p>` : ""}`)}</td></tr>
  ${ffl.length ? `<tr><td class="pad" style="padding:18px 52px 4px">${box(`
    ${label("Ships to your FFL dealer")}
    <p style="margin:0 0 6px;font-family:${SERIF};font-size:15px;line-height:1.6;color:${INK}">${ffl.map(escHtml).join("<br>")}</p>`)}</td></tr>` : ""}
  <tr><td class="pad" style="padding:30px 52px 4px">
    ${label("What happens next")}
    <table role="presentation" cellpadding="0" cellspacing="0">
    ${step("I", "We review your order", "We check your order and your FFL dealer's details. If anything is missing, we'll reach out to you.")}
    ${step("II", "Your gun ships", `Orders paid by card usually ship within 2 to 5 business days, fully insured, to your FFL dealer. We'll let you know when ${many ? "they're" : "it's"} on the way.`)}
    ${step("III", "Pick it up at your dealer", `Your dealer completes the transfer with you, including the background check, and hands you your ${many ? "guns" : "gun"}.`)}
    </table>
  </td></tr>
  ${order.account ? `<tr><td align="center" style="padding:10px 52px 30px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${GOLD}" style="background-color:${GOLD}">
    <a class="btn" href="${SITE}/account" style="display:inline-block;padding:16px 28px;white-space:nowrap;background-color:${GOLD};border:1px solid ${GOLD};font-family:Georgia,serif;font-size:12px;font-weight:700;line-height:12px;letter-spacing:.2em;text-transform:uppercase;color:#ffffff;text-decoration:none">Follow your order</a></td></tr></table></td></tr>` : ""}
  <tr><td class="pad" style="padding:${order.account ? 0 : 14}px 52px 0">
    ${p("Questions about your order, your gun's number or your dealer? Just reply to this email, or reach us any way you like:")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border-top:1px solid ${LINE}">
    ${contact("Call or text", "tel:+17869313566", "1-786-931-3566")}
    ${contact("WhatsApp", "https://wa.me/17869313566", "1-786-931-3566")}
    ${contact("Email", "mailto:info@gdecollectibles.com", "info@gdecollectibles.com")}
    </table>
    <p style="margin:0 0 4px;font-family:${SERIF};font-size:17px;font-style:italic;line-height:1.7;color:${INK}">With gratitude,</p>
    <img src="${SITE}/assets/email/welcome-signature.png" width="140" alt="RP" style="display:block;width:140px;height:auto;border:0;margin:4px 0">
    <p style="margin:0 0 36px;font-family:${SERIF};font-size:15px;line-height:1.6;color:${SOFT}">The GDE Collectibles family</p>
  </td></tr>
  <tr><td class="pad" style="padding:20px 52px 30px;border-top:1px solid ${LINE};font-family:${SERIF};font-size:12px;line-height:1.6;color:${MUTED}">
    Family owned · Gun Decor Emporium LLC · <a href="${SITE}" style="color:${MUTED}">gdecollectibles.com</a><br>
    You're getting this because you placed order ${escHtml(order.invoice)} on gdecollectibles.com.</td></tr>
</table></td></tr>
</table>
</td></tr></table></body></html>`;

  const text = `${test ? "TEST ORDER: no real payment was taken.\n\n" : ""}Thank you for your order.

Dear ${first || "there"},

Your payment went through and your order is confirmed. We're truly honored that you chose GDE Collectibles, and we'll take great care of ${many ? "your pieces" : "your piece"} from here.

YOUR ORDER
Order ${order.invoice} · ${when}
${items.map((i) => `- ${i.name}: ${usd(i.listPrice ?? i.price)}`).join("\n")}
${saved > 0 ? `Subtotal: ${usd(subtotal)}\n${discountName}: -${usd(saved)}\n` : ""}Shipping and insurance: Included
Total paid: ${usd(total)}${paidWith ? `\nPaid with ${paidWith}` : ""}
${ffl.length ? `\nSHIPS TO YOUR FFL DEALER\n${ffl.join("\n")}\n` : ""}
WHAT HAPPENS NEXT
I. We review your order: we check your order and your FFL dealer's details. If anything is missing, we'll reach out to you.
II. Your gun ships: orders paid by card usually ship within 2 to 5 business days, fully insured, to your FFL dealer. We'll let you know when ${many ? "they're" : "it's"} on the way.
III. Pick it up at your dealer: your dealer completes the transfer with you, including the background check, and hands you your ${many ? "guns" : "gun"}.
${order.account ? `\nFollow your order: ${SITE}/account\n` : ""}
Questions about your order, your gun's number or your dealer? Just reply to this email, or reach us any way you like:
- Call or text: 1-786-931-3566
- WhatsApp: 1-786-931-3566
- Email: info@gdecollectibles.com

With gratitude,
The GDE Collectibles family

--
Family owned · Gun Decor Emporium LLC · gdecollectibles.com
You're getting this because you placed order ${order.invoice} on gdecollectibles.com.`;
  return { subject, html, text };
}

// Sends it from orders@; throws when it can't (so _orderconfirm.js tries again on the next check).
let gunsCache = null;
function siteGuns() {
  if (gunsCache) return gunsCache;
  try {
    const fs = require("node:fs"), path = require("node:path");
    gunsCache = JSON.parse(fs.readFileSync(path.join(process.cwd(), "codex-inventory.json"), "utf8")).products || {};
  } catch { gunsCache = {}; }
  return gunsCache;
}
async function sendOrderConfirmation(to, order) {
  if (!configured()) throw new Error("RESEND_API_KEY is not set in Vercel.");
  const email = orderEmail(order, { guns: siteGuns() });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `order-${order.invoice}` },
    body: JSON.stringify({ from: ORDERS_FROM(), to: [to], reply_to: REPLY_TO(), ...email })
  });
  if (!response.ok) {
    const why = await response.text().catch(() => "");
    console.error("Resend order", response.status, why.slice(0, 300));
    throw new Error(`Resend refused the order email (${response.status}).`);
  }
}

module.exports = { configured, send, sendCode, welcomeEmail, sendWelcome, customerEmail, saleEndEmail, sendBatch, orderEmail, sendOrderConfirmation };
