// collector-request.html (user, Nov 12, 2026): a signed-in customer asks GDE to count guns they bought outside the
// website toward the Collectors Club / Legacy Club, with receipts or photos as proof. Photos are shrunk here before
// sending (each file has to stay under 700 KB). Talks to /api/collector-request; GDE approves in the inventory app.
(() => {
  const root = document.querySelector("#creditApp");
  if (!root) return;
  const API = "/api/collector-request";
  const MAX_FILES = 5, MAX_BYTES = 700 * 1024;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const day = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); };
  const STATUS = { pending: "Being checked", approved: "Approved", declined: "Not approved" };

  const fail = (text) => { root.innerHTML = `<div class="credit-card"><p>${esc(text)} You can also call us at <a href="tel:+17869313566">1-786-931-3566</a>.</p></div>`; };

  async function load() {
    let data;
    try {
      const r = await fetch(API, { credentials: "same-origin" });
      data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Requests aren't available right now.");
    } catch (error) { return fail(error.message.includes("fetch") ? "Requests aren't available right now." : error.message); }
    if (!data.user) {
      root.innerHTML = `<div class="credit-card credit-signin">
        <h2>Sign in first</h2>
        <p>Your guns are counted on your account, so sign in with the email you want them added to.</p>
        <a class="button" href="account.html?next=collector-request.html">Sign In</a>
      </div>`;
      return;
    }
    render(data);
  }

  function statusLine(st) {
    const tier = st.tierName ? `You're a ${esc(st.tierName)}` : "No tier yet";
    const next = st.next ? ` ${st.next.toGo} more for ${esc(st.next.name)} (${st.next.percent}% off).` : "";
    return `<p class="credit-status"><b>${tier}</b> · ${st.guns} gun${st.guns === 1 ? "" : "s"} on your account${st.credited ? ` (${st.credited} added by GDE)` : ""}.${next}</p>`;
  }

  function render(data) {
    const u = data.user;
    const past = data.requests.length ? `<section class="credit-past"><h2>Your requests</h2>${data.requests.map((r) => `
        <div class="credit-past-row"><div><strong>${r.guns} gun${r.guns === 1 ? "" : "s"}</strong> · ${esc(r.where)}<span>${day(r.createdAt)}</span></div>
        <span class="credit-pill ${r.status}">${STATUS[r.status] || r.status}${r.status === "approved" ? `: ${r.gunsCredited} added` : ""}</span></div>`).join("")}</section>` : "";
    root.innerHTML = `${statusLine(data.status)}
      <form class="credit-form" id="creditForm" novalidate>
        <p class="credit-for">Guns will be added to <b>${esc(u.email)}</b>.</p>
        <div class="credit-grid">
          <label>Your name<input name="name" autocomplete="name" maxlength="100" value="${esc(u.name || "")}" required></label>
          <label>Phone (optional)<input name="phone" type="tel" autocomplete="tel" maxlength="40"></label>
          <label>Where did you buy it?<select name="where" required>
            <option value="">Choose one</option>
            <option value="in_person">In person from GDE</option>
            <option value="phone">By phone from GDE</option>
            <option value="gun_show">At a gun show</option>
            <option value="gunbroker">GunBroker</option>
            <option value="guns_international">Guns International</option>
            <option value="other">Somewhere else</option>
          </select></label>
          <label class="credit-other" hidden>Where?<input name="whereOther" maxlength="120" placeholder="Store, website or event"></label>
          <label>When? (about)<input name="when" maxlength="40" placeholder="e.g. March 2026"></label>
          <label>How many guns?<input name="guns" type="number" min="1" max="20" step="1" value="1" required></label>
          <label class="wide">Which guns?<textarea name="which" rows="2" maxlength="1000" required placeholder="Collection names, and serial numbers if you have them"></textarea></label>
          <label class="wide">Tell us about the purchase<textarea name="explanation" rows="4" maxlength="3000" placeholder="Who you bought from, how you paid, anything that helps us find it"></textarea></label>
        </div>
        <div class="credit-files">
          <p class="credit-files-title">Proof</p>
          <p class="credit-hint">Receipts, invoices, transfer paperwork or photos of the gun. Pictures or PDFs, up to ${MAX_FILES} files.</p>
          <label class="credit-drop"><input type="file" name="files" accept="image/*,application/pdf" multiple><span>Add receipts or photos</span></label>
          <ul class="credit-file-list" id="creditFileList"></ul>
        </div>
        <label class="credit-confirm"><input type="checkbox" name="confirm" required> <span>This information is true, and I understand GDE will check it before adding anything to my account.</span></label>
        <button class="button" type="submit">Send Request</button>
        <p class="credit-msg" aria-live="polite"></p>
      </form>
      ${past}`;
    bind();
  }

  // Pictures are redrawn smaller as JPEG until they fit; PDFs go as they are, if small enough.
  async function prepare(file) {
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      if (file.size > MAX_BYTES) throw new Error(`${file.name} is too large. Send a photo or screenshot of it instead.`);
      return { name: file.name, blob: file };
    }
    let img;
    try { img = await createImageBitmap(file); }
    catch { throw new Error(`${file.name} couldn't be read. Try a JPEG photo or a screenshot.`); }
    for (const [edge, quality] of [[2000, .85], [1600, .8], [1300, .72], [1000, .65]]) {
      const scale = Math.min(1, edge / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= MAX_BYTES) return { name: file.name.replace(/\.[^.]+$/, "") + ".jpg", blob };
    }
    throw new Error(`${file.name} is too large even after shrinking it.`);
  }

  const toBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  function bind() {
    const form = root.querySelector("#creditForm"), msg = form.querySelector(".credit-msg");
    const list = root.querySelector("#creditFileList");
    let chosen = [];
    const showFiles = () => {
      list.innerHTML = chosen.map((f, i) => `<li><span>${esc(f.name)}</span><button type="button" data-i="${i}" aria-label="Remove ${esc(f.name)}">&times;</button></li>`).join("");
      list.querySelectorAll("button").forEach((b) => b.onclick = () => { chosen.splice(Number(b.dataset.i), 1); showFiles(); });
    };
    form.files.addEventListener("change", () => {
      chosen = [...chosen, ...form.files.files].slice(0, MAX_FILES);
      form.files.value = "";
      showFiles();
    });
    form.where.addEventListener("change", () => { form.querySelector(".credit-other").hidden = form.where.value !== "other"; });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const error = (text) => { msg.className = "credit-msg error"; msg.textContent = text; };
      if (!form.where.value) return error("Tell us where you bought the gun.");
      if (form.where.value === "other" && !form.whereOther.value.trim()) return error("Tell us where you bought the gun.");
      if (!form.which.value.trim()) return error("Tell us which gun or guns you bought.");
      if (!chosen.length) return error("Add at least one receipt or photo as proof.");
      if (!form.confirm.checked) return error("Please tick the box to confirm.");
      const button = form.querySelector("button[type=submit]");
      button.disabled = true; msg.className = "credit-msg"; msg.textContent = "Preparing your files...";
      try {
        const files = [];
        for (const f of chosen) { const p = await prepare(f); files.push({ name: p.name, data: await toBase64(p.blob) }); }
        msg.textContent = "Sending...";
        const body = Object.fromEntries(["name", "phone", "where", "whereOther", "when", "guns", "which", "explanation"].map((k) => [k, form[k].value]));
        const r = await fetch(API, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, files }) });
        const result = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(result.error || "Something went wrong. Please try again.");
        root.innerHTML = `<div class="credit-card credit-done"><p class="eyebrow">Request received</p><h2>Thank you</h2>
          <p>We'll check your purchase and add it to your account. You'll see it on your <a href="account.html">account page</a> once it's approved.</p>
          <a class="button" href="collectors.html">Back to Collectors</a></div>`;
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (err) { button.disabled = false; error(err.message); }
    });
  }

  load();
})();
