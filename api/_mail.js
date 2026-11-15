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

module.exports = { configured, send, sendCode };
