// Customer accounts and the email list, on every page (after script.js):
// - an "Account" link in the menu and an "Email alerts" link in the footer
// - the email-list popup: once, a little after the age check, never on checkout or payment pages,
//   and not again for 30 days once closed (or ever, once joined)
// - on account.html: Google sign-in, the customer's orders, order lookup by email + order number, email alerts on/off
// Talks to /api/account (api/account.js).
(() => {
  const API = "/api/account";
  const DISMISS_DAYS = 30;
  const page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const NO_POPUP = ["checkout.html", "payment-success.html", "payment-cancel.html", "cart.html", "account.html", "iframe-communicator.html"];

  const css = document.createElement("link");
  css.rel = "stylesheet"; css.href = "account.css?v=20261108acct4";
  document.head.append(css);

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} }
  };

  async function api(action, body) {
    const response = await fetch(`${API}?action=${action}`, body === undefined
      ? { credentials: "same-origin" }
      : { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Something went wrong. Please try again.");
    return result;
  }

  // ---- menu and footer links
  const nav = document.querySelector(".site-nav");
  if (nav && !nav.querySelector(".account-nav")) {
    const link = document.createElement("a");
    link.href = "account.html"; link.className = "account-nav"; link.setAttribute("aria-label", "Account");
    link.innerHTML = '<svg class="account-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.2-4.2 4.3-6.3 8-6.3s6.8 2.1 8 6.3"/></svg><span>Account</span>';
    if (page === "account.html") link.classList.add("active");
    const cart = nav.querySelector(".cart-nav");
    cart ? nav.insertBefore(link, cart) : nav.append(link);
  }
  const footerLinks = document.querySelector(".footer-links");
  if (footerLinks) {
    const a = document.createElement("a");
    a.href = "#email-alerts"; a.textContent = "Email alerts";
    a.addEventListener("click", (e) => { e.preventDefault(); openSignup("footer"); });
    footerLinks.append(a);
    const acct = document.createElement("a");
    acct.href = "account.html"; acct.textContent = "My orders";
    footerLinks.append(acct);
  }

  // ---- email list popup
  let popup = null;
  function closeSignup(remember) {
    if (!popup) return;
    if (remember) store.set("gdeSignupDismissed", String(Date.now()));
    const el = popup; popup = null;
    el.classList.remove("open");
    setTimeout(() => el.remove(), 350);
    document.removeEventListener("keydown", onKey);
  }
  const onKey = (e) => { if (e.key === "Escape") closeSignup(true); };

  function openSignup(source) {
    if (popup || document.querySelector(".age-gate")) return;
    popup = document.createElement("div");
    popup.className = "gde-signup";
    popup.setAttribute("role", "dialog"); popup.setAttribute("aria-modal", "true"); popup.setAttribute("aria-labelledby", "gdeSignupTitle");
    popup.innerHTML = `<div class="gde-signup-panel">
      <button class="gde-signup-close" type="button" aria-label="Close">&times;</button>
      <p class="eyebrow">The collector list</p>
      <h2 id="gdeSignupTitle">First look at new collections</h2>
      <p>New editions, limited releases and collector offers.</p>
      <form novalidate>
        <label class="gde-field">Email address<input type="email" name="email" autocomplete="email" required inputmode="email"></label>
        <label class="gde-field">First name (optional)<input name="firstName" autocomplete="given-name" maxlength="60"></label>
        <label class="gde-hp" aria-hidden="true">Company<input name="company" tabindex="-1" autocomplete="off"></label>
        <button class="button" type="submit">Join the list</button>
        <p class="gde-msg" aria-live="polite"></p>
      </form>
      <p class="gde-fine">Unsubscribe any time. We never share your email. <a href="privacy.html">Privacy</a></p>
      <button class="gde-signup-later" type="button">No thanks</button>
    </div>`;
    document.body.append(popup);
    requestAnimationFrame(() => popup && popup.classList.add("open"));
    const form = popup.querySelector("form"), msg = popup.querySelector(".gde-msg");
    popup.querySelector(".gde-signup-close").addEventListener("click", () => closeSignup(true));
    popup.querySelector(".gde-signup-later").addEventListener("click", () => closeSignup(true));
    popup.addEventListener("click", (e) => { if (e.target === popup) closeSignup(true); });
    document.addEventListener("keydown", onKey);
    setTimeout(() => form.email.focus({ preventScroll: true }), 60);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = form.email.value.trim();
      if (!/^\S+@\S+\.\S{2,}$/.test(email)) { msg.className = "gde-msg error"; msg.textContent = "Please enter a valid email address."; return; }
      const button = form.querySelector("button"); button.disabled = true; msg.className = "gde-msg"; msg.textContent = "Joining...";
      try {
        await api("subscribe", { email, firstName: form.firstName.value, company: form.company.value, source, page: location.pathname });
        store.set("gdeSubscribed", "1");
        popup.querySelector(".gde-signup-panel").innerHTML = `<button class="gde-signup-close" type="button" aria-label="Close">&times;</button>
          <div class="gde-done"><p class="eyebrow">You're on the list</p><h2>Thank you</h2><p>You'll hear about the next collection first.</p>
          <button class="button" type="button">Continue</button></div>`;
        popup.querySelectorAll(".gde-signup-panel button").forEach((b) => b.addEventListener("click", () => closeSignup(false)));
      } catch (error) {
        button.disabled = false; msg.className = "gde-msg error"; msg.textContent = error.message;
      }
    });
  }
  window.gdeOpenSignup = openSignup;

  function maybeAutoOpen() {
    if (NO_POPUP.includes(page) || store.get("gdeSubscribed")) return;
    const dismissed = Number(store.get("gdeSignupDismissed") || 0);
    if (dismissed && Date.now() - dismissed < DISMISS_DAYS * 86400000) return;
    let started = false;
    const start = () => {
      if (started) return; started = true;
      const open = () => { cleanup(); openSignup("popup"); };
      const timer = setTimeout(open, 12000);
      const onScroll = () => { if (scrollY > (document.documentElement.scrollHeight - innerHeight) * 0.45) open(); };
      const cleanup = () => { clearTimeout(timer); removeEventListener("scroll", onScroll); };
      addEventListener("scroll", onScroll, { passive: true });
    };
    // Wait for the age check first, if it's showing.
    if (document.querySelector(".age-gate")) {
      document.addEventListener("click", (e) => { if (e.target.closest("#ageConfirm")) setTimeout(start, 0); });
    } else start();
  }
  maybeAutoOpen();

  // ---- account page
  const root = document.querySelector("#gdeAccount");
  if (!root) return;
  // script.js's listings (a top-level const there, so readable by name here, not as window.products).
  const productsRef = typeof products === "object" ? products : null;

  const money = (n) => Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  const day = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); };
  const statusClass = (s) => s === "paid" ? "paid" : ["declined", "voided", "refunded", "not_paid"].includes(s) ? "bad" : "";

  function orderHtml(o) {
    const items = o.items.map((i) => {
      const p = productsRef?.[i.listing];
      const photo = Array.isArray(p?.photos) && p.photos[0] ? ` style="background-image:url('${esc(p.photos[0])}')"` : "";
      const name = p ? `<a href="product.html?product=${encodeURIComponent(i.listing)}">${esc(i.name)}</a>` : esc(i.name);
      return `<div class="gde-order-item"><div class="thumb-img"${photo}></div><div>${name}${p ? `<div class="gde-note">${esc(p.platform || "")}${p.finish ? " · " + esc(p.finish) : ""}</div>` : ""}</div><b>${money(i.price)}</b></div>`;
    }).join("");
    return `<article class="gde-order">
      <div class="gde-order-top"><div><strong>${esc(o.invoice)}</strong> <span>${day(o.createdAt)}</span></div><span class="gde-status ${statusClass(o.status)}">${esc(o.statusText)}</span></div>
      ${items}
      <div class="gde-order-foot"><span>${o.ffl?.business ? `Transfer to ${esc(o.ffl.business)}` : "FFL transfer"}${o.test ? " · test order" : ""}</span><span>Total <strong>${money(o.amount)}</strong></span></div>
    </article>`;
  }

  const lookupHtml = `<div class="gde-card" id="gdeLookupCard">
      <h2>Find an order</h2>
      <p>No Google account? Use the email you checked out with and your order number (it starts with GDE- and is in your confirmation).</p>
      <form class="gde-account-form" id="gdeLookup" novalidate>
        <label class="gde-field">Email used at checkout<input type="email" name="email" autocomplete="email" required></label>
        <label class="gde-field">Order number<input name="invoice" placeholder="GDE-0000000000" autocomplete="off" required></label>
        <button class="button" type="submit">Find my order</button>
        <p class="gde-msg" aria-live="polite"></p>
      </form>
    </div>`;

  function bindLookup() {
    const form = root.querySelector("#gdeLookup");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = form.querySelector(".gde-msg"), out = root.querySelector("#gdeLookupResult");
      msg.className = "gde-msg"; msg.textContent = "Looking...";
      try {
        const { order } = await api("lookup", { email: form.email.value, invoice: form.invoice.value });
        msg.textContent = "";
        out.innerHTML = `<h2>Your order</h2>${orderHtml(order)}`;
        out.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (error) { msg.className = "gde-msg error"; msg.textContent = error.message; out.innerHTML = ""; }
    });
  }

  // Signed out: a single centered column (user, Nov 8: like Gymshark's login, in the site's own look), with no menu
  // or footer; the logo goes back to the shop.
  function renderSignedOut(config) {
    document.body.classList.add("gde-auth-mode");
    root.innerHTML = `<div class="gde-auth">
        <a class="gde-auth-logo" href="index.html" aria-label="GDE Collectibles home"></a>
        <h1 class="gde-auth-title">Collector Login</h1>
        <p class="gde-auth-sub">Track your orders, follow your FFL transfer and get the first look at new collections.</p>
        <div class="gde-google" id="gdeGoogle">${config.googleClientId ? "" : `<p class="gde-note">Google sign-in is coming soon. Use your order number below for now.</p>`}</div>
        <p class="gde-msg" id="gdeSignInMsg" aria-live="polite"></p>
        <div class="gde-or"><span>or find an order</span></div>
        <form class="gde-auth-form" id="gdeLookup" novalidate>
          <label class="gde-sr" for="gdeLookupEmail">Email used at checkout</label>
          <input id="gdeLookupEmail" type="email" name="email" autocomplete="email" placeholder="Email used at checkout*" required>
          <label class="gde-sr" for="gdeLookupInvoice">Order number</label>
          <input id="gdeLookupInvoice" name="invoice" autocomplete="off" placeholder="Order number* (GDE-0000000000)" required>
          <button class="button secondary" type="submit">Find My Order</button>
          <p class="gde-msg" aria-live="polite"></p>
        </form>
        <p class="gde-auth-foot">Need help with an order? <a href="contact.html">Contact us</a></p>
        <p class="gde-auth-fine">We only receive your name and email from Google, never your password.</p>
      </div>
      <section class="gde-orders" id="gdeLookupResult"></section>`;
    bindLookup();
    if (config.googleClientId) loadGoogle(config.googleClientId);
  }

  function loadGoogle(clientId) {
    const box = root.querySelector("#gdeGoogle"), msg = root.querySelector("#gdeSignInMsg");
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onerror = () => { msg.className = "gde-msg error"; msg.textContent = "Google sign-in could not load. Check your connection or ad blocker."; };
    s.onload = () => {
      google.accounts.id.initialize({
        client_id: clientId,
        ux_mode: "popup",
        callback: async ({ credential }) => {
          msg.className = "gde-msg"; msg.textContent = "Signing in...";
          try { await api("google", { credential }); await load(); }
          catch (error) { msg.className = "gde-msg error"; msg.textContent = error.message; }
        }
      });
      // As wide as the column (Google's limit is 400 px), white like the site's own main buttons.
      google.accounts.id.renderButton(box, { theme: "outline", size: "large", shape: "rectangular", text: "continue_with", logo_alignment: "center", width: Math.min(400, Math.floor(box.clientWidth) || 320) });
      box.classList.add("ready");
    };
    document.head.append(s);
  }

  function renderSignedIn(data) {
    document.body.classList.remove("gde-auth-mode");
    const u = data.user;
    const orders = data.orders.length
      ? data.orders.map(orderHtml).join("")
      : `<p class="gde-empty">No orders under ${esc(u.email)} yet. Checked out with a different email? Use Find an order below.</p>`;
    root.innerHTML = `<div class="gde-account-grid">
        <div class="gde-card">
          <div class="gde-user">${u.picture ? `<img src="${esc(u.picture)}" alt="" referrerpolicy="no-referrer">` : ""}<div><strong>${esc(u.name || "Welcome")}</strong><span>${esc(u.email)}</span></div>
          <button class="gde-link-button" id="gdeSignOut" type="button">Sign out</button></div>
        </div>
        <div class="gde-card">
          <div class="gde-alerts"><div><h2>Email alerts</h2><p class="gde-note" style="margin:0">${data.subscribed ? "You get emails about new collections and offers." : "New collections, limited releases and collector offers."}</p></div>
          <button class="button${data.subscribed ? " secondary" : ""}" id="gdeAlerts" type="button">${data.subscribed ? "Stop emails" : "Get email alerts"}</button></div>
          <p class="gde-msg" id="gdeAlertsMsg" aria-live="polite"></p>
        </div>
      </div>
      <section class="gde-orders"><h2>Your orders</h2>${orders}</section>
      <section class="gde-orders"><div class="gde-account-grid">${lookupHtml}</div></section>
      <section class="gde-orders" id="gdeLookupResult"></section>`;
    root.querySelector("#gdeSignOut").addEventListener("click", async () => {
      try { await api("logout", {}); window.google?.accounts?.id?.disableAutoSelect(); } catch {}
      load();
    });
    root.querySelector("#gdeAlerts").addEventListener("click", async (e) => {
      const msg = root.querySelector("#gdeAlertsMsg");
      e.currentTarget.disabled = true;
      try {
        await api(data.subscribed ? "unsubscribe" : "subscribe", data.subscribed ? {} : { source: "account", page: location.pathname });
        if (!data.subscribed) store.set("gdeSubscribed", "1");
        load();
      } catch (error) { e.currentTarget.disabled = false; msg.className = "gde-msg error"; msg.textContent = error.message; }
    });
    bindLookup();
    if (data.listStatus === "none") askToJoin(data.user);
  }

  // Right after signing up (first Google sign-in): join the collector list? Asked once; either answer is saved.
  function askToJoin(u) {
    if (document.querySelector(".gde-signup")) return;
    const first = esc((u.name || "").split(" ")[0]);
    const box = document.createElement("div");
    box.className = "gde-signup";
    box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-labelledby", "gdeJoinTitle");
    box.innerHTML = `<div class="gde-signup-panel">
      <p class="eyebrow">${first ? `Welcome, ${first}` : "Welcome"}</p>
      <h2 id="gdeJoinTitle">Join the collector list?</h2>
      <p>Emails about new collections, limited releases and collector offers. Unsubscribe any time.</p>
      <div class="gde-join-actions">
        <button class="button" type="button" data-join="yes">Yes, add me</button>
        <button class="gde-signup-later" type="button" data-join="no">No thanks</button>
      </div>
      <p class="gde-msg" aria-live="polite"></p>
    </div>`;
    document.body.append(box);
    requestAnimationFrame(() => box.classList.add("open"));
    const close = () => { box.classList.remove("open"); setTimeout(() => box.remove(), 350); };
    box.querySelectorAll("[data-join]").forEach((b) => b.addEventListener("click", async () => {
      const join = b.dataset.join === "yes", msg = box.querySelector(".gde-msg");
      box.querySelectorAll("button").forEach((x) => (x.disabled = true));
      try {
        await api(join ? "subscribe" : "decline", join ? { source: "signup", page: location.pathname } : {});
        if (join) store.set("gdeSubscribed", "1");
        close(); load();
      } catch (error) {
        box.querySelectorAll("button").forEach((x) => (x.disabled = false));
        msg.className = "gde-msg error"; msg.textContent = error.message;
      }
    }));
  }

  async function load() {
    try {
      const config = await api("config");
      const me = config.ready ? await api("me") : { user: null };
      if (me.user) renderSignedIn(me); else renderSignedOut(config);
    } catch (error) {
      root.innerHTML = `<div class="gde-card"><h2>Accounts are unavailable</h2><p>${esc(error.message)} You can still call us at 1-786-931-3566.</p></div>`;
    }
  }
  load();
})();
