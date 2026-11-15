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

module.exports = { configured, send, sendCode, customerEmail, sendBatch };
