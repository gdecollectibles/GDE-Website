// Live countdown picture for emails (user, Nov 20: Black Friday email "with a live tracker").
//   GET /api/countdown?to=<ISO time>   (to defaults to the end of the Black Friday sale, Nov 28 2026 00:00 Miami time)
// Emails can't run code, so each time someone opens the email their mail app asks for this picture and gets a GIF
// drawn right then: the time left (days, hours, minutes, seconds) ticking down for 60 seconds, then it stays on the
// last second. Outlook on Windows shows only the first frame, which is still the time left when it was opened.
// The art (box, labels, digits) comes from website/countdown_art.py as palette indexes; this file only pastes
// digits and writes the GIF, so the site needs no image library. Never cached, so every open is fresh.
const zlib = require("node:zlib");
const ART = require("./_countdown-art.json");

const DEFAULT_END = "2026-11-28T00:00:00-05:00";
const FRAMES = 60;
const BG = zlib.inflateSync(Buffer.from(ART.bg, "base64"));
const GLYPHS = zlib.inflateSync(Buffer.from(ART.glyphs, "base64"));
const { w: W, h: H, dw: DW, dh: DH, digitY: DY, digitX: DX } = ART;

// LZW for GIF image data (variable code size, clear when the table is full).
function lzw(minCode, pixels) {
  const clear = 1 << minCode, eoi = clear + 1;
  let codeSize = minCode + 1, next = eoi + 1, dict = new Map();
  const out = [];
  let cur = 0, bits = 0;
  const put = (code) => { cur |= code << bits; bits += codeSize; while (bits >= 8) { out.push(cur & 255); cur >>>= 8; bits -= 8; } };
  put(clear);
  let prefix = pixels[0];
  for (let i = 1; i < pixels.length; i++) {
    const k = pixels[i], key = prefix * 256 + k;
    const found = dict.get(key);
    if (found !== undefined) { prefix = found; continue; }
    put(prefix);
    if (next === 4096) { put(clear); dict = new Map(); codeSize = minCode + 1; next = eoi + 1; }
    else { if (next >= (1 << codeSize)) codeSize++; dict.set(key, next++); }
    prefix = k;
  }
  put(prefix);
  put(eoi);
  if (bits > 0) out.push(cur & 255);
  return out;
}

// One frame: graphic control (keep the frame under it, delay in 1/100 s) + image descriptor + data in 255-byte blocks.
function frame(bytes, canvas, x, y, w, h, delay) {
  bytes.push(0x21, 0xf9, 4, 0x04, delay & 255, delay >> 8, 0, 0);
  bytes.push(0x2c, x & 255, x >> 8, y & 255, y >> 8, w & 255, w >> 8, h & 255, h >> 8, 0);
  const pixels = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) pixels.set(canvas.subarray((y + r) * W + x, (y + r) * W + x + w), r * w);
  const data = lzw(4, pixels);
  bytes.push(4);
  for (let i = 0; i < data.length; i += 255) {
    const n = Math.min(255, data.length - i);
    bytes.push(n);
    for (let j = 0; j < n; j++) bytes.push(data[i + j]);
  }
  bytes.push(0);
}

function drawDigit(canvas, slot, n) {
  const x0 = DX[slot], g = n * DW * DH;
  for (let r = 0; r < DH; r++) {
    const row = (DY + r) * W + x0;
    for (let c = 0; c < DW; c++) canvas[row + c] = GLYPHS[g + r * DW + c]; // 0 = box colour, 1..7 = ink
  }
}

// The 8 digits for a number of seconds left: DD HH MM SS (days stop at 99).
function digits(left) {
  const d = Math.min(99, Math.floor(left / 86400)), h = Math.floor(left / 3600) % 24, m = Math.floor(left / 60) % 60, s = left % 60;
  return [d, h, m, s].flatMap((v) => [Math.floor(v / 10), v % 10]);
}

function countdownGif(endMs, nowMs) {
  const start = Math.max(0, Math.floor((endMs - nowMs) / 1000));
  const count = Math.min(FRAMES, start + 1);
  const canvas = Uint8Array.from(BG);
  const bytes = [...Buffer.from("GIF89a"), W & 255, W >> 8, H & 255, H >> 8, 0xf3, 0, 0];
  for (const [r, g, b] of ART.palette) bytes.push(r, g, b);
  let shown = digits(start);
  shown.forEach((n, slot) => drawDigit(canvas, slot, n));
  frame(bytes, canvas, 0, 0, W, H, count > 1 ? 100 : 0);
  for (let i = 1; i < count; i++) {
    const now = digits(start - i);
    const changed = now.map((n, slot) => n !== shown[slot] ? slot : -1).filter((s) => s >= 0);
    changed.forEach((slot) => drawDigit(canvas, slot, now[slot]));
    const x0 = DX[changed[0]], x1 = DX[changed[changed.length - 1]] + DW;
    frame(bytes, canvas, x0, DY, x1 - x0, DH, 100);
    shown = now;
  }
  bytes.push(0x3b);
  return Buffer.from(bytes);
}

module.exports = async function handler(request, response) {
  const url = new URL(request.url, "https://www.gdecollectibles.com");
  let end = Date.parse(url.searchParams.get("to") || DEFAULT_END);
  if (!Number.isFinite(end) || Math.abs(end - Date.now()) > 400 * 86400000) end = Date.parse(DEFAULT_END);
  response.setHeader("Content-Type", "image/gif");
  response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
  response.status(200).send(countdownGif(end, Date.now()));
};
module.exports.countdownGif = countdownGif;
