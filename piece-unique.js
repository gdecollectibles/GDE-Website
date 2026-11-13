// piece-unique.html, "Piece Unique" (user, Nov 13, 2026): someone asks GDE for a custom piece: the gun (model, caliber),
// whose design (their own, GDE designs it, or a collection changed), where it goes, the colors and finish.
// Pictures are shrunk here as JPEG (each under 700 KB); PDFs go as they are if small enough. Sends to
// /api/custom-request, which saves it with the Contact messages; the GDE app shows it in Website inquiries.
// The option lists below are checked again in api/custom-request.js: change both together.
// From a gun page: ?collection=<name>&model=<model>&caliber=<caliber>&gun=<gun, number> starts from that gun.
(() => {
  const form = document.querySelector("#uniqueForm");
  if (!form) return;
  const API = "/api/custom-request";
  const MAX_FILES = 4, MAX_BYTES = 700 * 1024;
  const LISTS = {
    models: ["Colt M1911", "Colt Government Model", "Colt Government Series 70", "Another model", "Not sure, recommend one"],
    calibers: [".45 ACP", ".38 Super", "9mm", "Another caliber", "Not sure"],
    collections: ["The Capital", "Remember the Alamo", "Blue Finish", "US Constitution", "Mt. Rushmore", "USS Constitution",
      "America's 250 Anniversary", "Donald J Trump", "El Alamo", "Scrolls"],
    placements: ["Slide, left side", "Slide, right side", "Top of the slide", "Frame", "Grips", "Everywhere"],
    finishes: ["Polished stainless steel", "24K gold plated", "Nickel", "Royal blue", "Black", "Your choice", "Something else (tell us below)"],
    fills: ["Gold-filled", "Silver / nickel", "Black", "Color (tell us below)", "Plain engraving, no fill", "Your choice"],
    grips: ["Pearl white", "Pearl brown", "Pearl blue", "Black pearl", "Wood", "Your choice", "Something else (tell us below)"],
    budgets: ["Under $3,000", "$3,000 to $5,000", "$5,000 to $8,000", "Over $8,000", "Not sure yet"]
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pills = (el, type, name, list) => { form.querySelector(el).innerHTML = list.map((v) => `<label><input type="${type}" name="${name}" value="${esc(v)}"><span>${esc(v)}</span></label>`).join(""); };
  pills("#modelOptions", "radio", "model", LISTS.models);
  pills("#caliberOptions", "radio", "caliber", LISTS.calibers);
  pills("#placementOptions", "checkbox", "placement", LISTS.placements);
  form.collection.insertAdjacentHTML("beforeend", LISTS.collections.map((c) => `<option>${esc(c)}</option>`).join(""));
  form.querySelectorAll("select[data-list]").forEach((sel) => { sel.innerHTML = `<option value="">Choose</option>${LISTS[sel.dataset.list].map((v) => `<option>${esc(v)}</option>`).join("")}`; });

  // What the design questions say depends on whose design it is.
  const DESIGN_TEXT = {
    own: { label: "Anything we should know about your design? <em>(optional)</em>", files: "Your design", hint: "Upload your artwork, logo or drawing. Pictures or PDFs, up to 4 files.", placeholder: "Size, which parts go where, anything to change." },
    gde: { label: "Tell us about the design", files: "Pictures <em>(optional)</em>", hint: "Anything that inspires you: a theme, a crest, a design you like. Pictures or PDFs, up to 4 files.", placeholder: "The theme, the story behind it, the style you like." },
    collection: { label: "What would you like changed?", files: "Pictures <em>(optional)</em>", hint: "Anything that shows the change you want. Pictures or PDFs, up to 4 files.", placeholder: "e.g. The Capital, with my family name on the right side and black grips." }
  };
  const showDesign = () => {
    const d = form.querySelector('input[name="design"]:checked')?.value || "gde";
    const t = DESIGN_TEXT[d];
    form.querySelector("#themeText").innerHTML = t.label;
    form.message.placeholder = t.placeholder;
    form.querySelector("#filesTitle").innerHTML = t.files;
    form.querySelector("#filesHint").textContent = t.hint;
    form.querySelector("#collectionWrap").hidden = d !== "collection";
  };
  form.querySelectorAll('input[name="design"]').forEach((r) => r.addEventListener("change", showDesign));
  const showOther = () => {
    form.querySelector("#modelOtherWrap").hidden = form.querySelector('input[name="model"]:checked')?.value !== "Another model";
    form.querySelector("#caliberOtherWrap").hidden = form.querySelector('input[name="caliber"]:checked')?.value !== "Another caliber";
  };
  form.querySelectorAll('input[name="model"], input[name="caliber"]').forEach((r) => r.addEventListener("change", showOther));

  // Starting from a gun page.
  const params = new URLSearchParams(location.search);
  const pick = (name, value) => {
    if (!value) return false;
    const want = value.toLowerCase().replace(/\s+/g, " ").trim();
    const hit = [...form.querySelectorAll(`input[name="${name}"]`)].find((r) => r.value.toLowerCase() === want);
    if (hit) hit.checked = true;
    return !!hit;
  };
  const model = params.get("model") || "";
  if (!pick("model", model) && /series 70/i.test(model)) pick("model", "Colt Government Series 70");
  else if (!form.querySelector('input[name="model"]:checked') && /government/i.test(model)) pick("model", "Colt Government Model");
  pick("caliber", params.get("caliber"));
  const startCollection = LISTS.collections.find((c) => c.toLowerCase() === (params.get("collection") || "").toLowerCase());
  if (startCollection) { pick("design", "collection"); form.collection.value = startCollection; }
  if (params.get("gun")) form.gunDetails.value = `Starting from: ${params.get("gun")}`.slice(0, 300);
  showDesign(); showOther();

  // Files: kept as chosen (thumbnails), shrunk only when sending.
  const thumbs = form.querySelector("#uniqueThumbs");
  let chosen = [];
  const isPdf = (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
  const showFiles = () => {
    thumbs.querySelectorAll("img").forEach((img) => URL.revokeObjectURL(img.src));
    thumbs.innerHTML = chosen.map((f, i) => `<li>${isPdf(f) ? `PDF<br>${esc(f.name)}` : `<img src="${URL.createObjectURL(f)}" alt="${esc(f.name)}">`}<button type="button" data-i="${i}" aria-label="Remove ${esc(f.name)}">&times;</button></li>`).join("");
    thumbs.querySelectorAll("button").forEach((b) => b.onclick = () => { chosen.splice(Number(b.dataset.i), 1); showFiles(); });
  };
  form.files.addEventListener("change", () => {
    chosen = [...chosen, ...[...form.files.files].filter((f) => /^image\//.test(f.type) || isPdf(f) || /\.(jpe?g|png|webp|heic)$/i.test(f.name))].slice(0, MAX_FILES);
    form.files.value = "";
    showFiles();
  });
  async function prepare(file) {
    if (isPdf(file)) {
      if (file.size > MAX_BYTES) throw new Error(`${file.name} is too large. Send a picture or screenshot of it instead.`);
      return { name: file.name, blob: file };
    }
    let img;
    try { img = await createImageBitmap(file); }
    catch { throw new Error(`${file.name} couldn't be read. Try a JPEG photo or a screenshot.`); }
    for (const [edge, quality] of [[2000, .85], [1600, .8], [1300, .72], [1000, .65]]) {
      const scale = Math.min(1, edge / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); // transparent artwork stays readable as JPEG
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
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

  const msg = form.querySelector(".form-message");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fail = (text, field) => { msg.className = "form-message error"; msg.textContent = text; field?.focus?.({ preventScroll: false }); };
    const design = form.querySelector('input[name="design"]:checked')?.value;
    if (!design) return fail("Choose whose design it is: yours, ours, or one of our collections.", form.querySelector('input[name="design"]'));
    if (design === "own" && !chosen.length && !form.message.value.trim()) return fail("Upload your design, or tell us about it.", form.files);
    if (design === "gde" && !form.message.value.trim()) return fail("Tell us about the design you'd like.", form.message);
    if (design === "collection" && !form.collection.value) return fail("Choose which collection to start from.", form.collection);
    if (design === "collection" && !form.message.value.trim()) return fail("Tell us what you'd like changed.", form.message);
    if (!form.name.value.trim()) return fail("Please enter your name.", form.name);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(form.email.value.trim())) return fail("Please check your email address. It should look like name@example.com.", form.email);
    if (!form.phone.value.trim()) return fail("Please enter your phone number.", form.phone);
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true; msg.className = "form-message";
    msg.textContent = chosen.length ? "Preparing your files..." : "Sending...";
    try {
      const files = [];
      for (const f of chosen) { const p = await prepare(f); files.push({ name: p.name, data: await toBase64(p.blob) }); }
      msg.textContent = "Sending...";
      const data = new FormData(form);
      const text = (k) => String(data.get(k) || "");
      const body = {
        ...Object.fromEntries(["website", "name", "email", "phone", "state", "model", "modelOther", "caliber", "caliberOther", "gunDetails",
          "design", "collection", "message", "text", "slide", "frame", "engraving", "grips", "colorNotes", "budget", "when"].map((k) => [k, text(k)])),
        placement: data.getAll("placement"),
        contactPreference: data.getAll("contactPreference"),
        files
      };
      const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
      const result = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(result.error || "Your request could not be sent. Please try again.");
      form.innerHTML = `<div class="unique-done"><p class="eyebrow">Request received</p><h2>Thank you</h2>
        <p>We'll look at your piece and come back to you with what's possible, a price and a timeline.</p>
        <a class="button" href="collections.html">Browse Collections</a></div>`;
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      button.disabled = false;
      fail(`${err.message.includes("fetch") ? "Your request could not be sent." : err.message} You can also call us at 1-786-931-3566.`);
    }
  });
})();
