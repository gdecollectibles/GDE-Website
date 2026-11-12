// Customer accounts and the email list, on every page (after script.js):
// - an "Account" link in the menu and an "Email alerts" link in the footer
// - the email-list popup: once, a little after the age check, never on checkout or payment pages,
//   and not again for 30 days once closed (or ever, once joined)
// - on account.html: Google sign-in, the customer's orders, collector status, order lookup by email + order number,
//   email alerts on/off
// - collector clubs (3+ guns bought: Collectors Club, 5% off; 5+: Legacy Club, 10% off; see api/_collector.js): the discount on checkout, the visitor's own
//   progress on collectors.html
// Talks to /api/account (api/account.js).
(() => {
  const API = "/api/account";
  const DISMISS_DAYS = 30;
  const page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const NO_POPUP = ["checkout.html", "payment-success.html", "payment-cancel.html", "cart.html", "account.html", "iframe-communicator.html"];

  const css = document.createElement("link");
  css.rel = "stylesheet"; css.href = "account.css?v=20261112hdr";
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

  // ---- collector status
  // One bar per gun up to the next tier (or as many as owned, once at the top); a gap marks where Collector starts.
  const pips = (st) => {
    const total = Math.max(st.next ? st.next.guns : 5, st.guns);
    return `<div class="collector-pips" aria-hidden="true">${Array.from({ length: total }, (_, i) =>
      `<span class="${i < st.guns ? "on" : ""}${i === 3 ? " tier-start" : ""}"></span>`).join("")}</div>`;
  };
  const guns = (n) => (n === 1 ? "one more gun" : `${n} more guns`);
  // The status box: on collectors.html and in the account page.
  function collectorBox(st, signedIn) {
    if (!signedIn) {
      return `<p class="eyebrow">Your status</p><h3>Sign in to see where you stand</h3>
        <p>Your collector status follows the email you sign in with. Guns already bought with that email count.</p>
        <a class="button" href="account.html?next=collectors.html">Sign In</a>`;
    }
    const nextLine = st.next ? ` Buy ${guns(st.next.toGo)} to join the ${st.next.name}, with ${st.next.percent}% off every purchase after that.` : "";
    if (st.collector) {
      return `<p class="eyebrow">Your status</p><h3>You're in the ${st.tierName}</h3>${pips(st)}
        <p>${st.guns} guns${st.referred ? `, ${st.referred} of them bought by friends through your link` : ""}. You get ${st.percent}% off every purchase, taken off at checkout while you're signed in.${nextLine}</p>
        <a class="button" href="collections.html">Browse Collections</a>`;
    }
    return `<p class="eyebrow">Your status</p><h3>${st.guns} of ${st.next.guns} guns</h3>${pips(st)}
      <p>${st.referred ? `${st.referred} of your guns ${st.referred === 1 ? "was" : "were"} bought by friends through your link. ` : ""}${guns(st.next.toGo).replace(/^o/, "O")} and you join the ${st.next.name}, with ${st.next.percent}% off every purchase after that.${st.guns >= 1 ? " Friends who buy through your link count too." : ""}</p>
      <a class="button" href="collections.html">Browse Collections</a>`;
  }
  window.gdeCollectorBox = collectorBox;

  // ---- friends and family code at checkout (api/_ffcode.js): 5% off, only for buyers with no club discount of their
  // own. Kept for the visit in sessionStorage; the payment API checks it again before taking the payment.
  function codeBox(me) {
    const summary = document.querySelector("#purchaseForm .order-summary dl");
    if (!summary || document.querySelector("#ffCodeBox")) return;
    const box = document.createElement("div");
    box.id = "ffCodeBox"; box.className = "ff-code-box";
    summary.after(box);
    const saved = (() => { try { return JSON.parse(sessionStorage.getItem("gdeFFCode")); } catch { return null; } })();
    const apply = (c) => {
      window.gdeFFCode = c;
      try { c ? sessionStorage.setItem("gdeFFCode", JSON.stringify(c)) : sessionStorage.removeItem("gdeFFCode"); } catch {}
      if (typeof renderCheckoutSummary === "function") renderCheckoutSummary();
      draw();
    };
    function draw() {
      if (me.collector?.collector) {
        box.innerHTML = `<p class="ff-note">Your ${esc(me.collector.tierName)} discount is applied. Friends and family codes are for buyers who aren't in a club.</p>`;
        return;
      }
      const c = window.gdeFFCode;
      box.innerHTML = c
        ? `<p class="ff-applied"><span>Code <b>${esc(c.code)}</b> applied</span><button type="button" class="gde-link-button" id="ffRemove">Remove</button></p>`
        : `<details class="ff-enter"><summary>Have a friends and family code?</summary>
            <div class="ff-row"><label class="gde-sr" for="ffCodeInput">Friends and family code</label><input id="ffCodeInput" autocomplete="off" autocapitalize="characters" maxlength="20" placeholder="Code"><button type="button" class="button button-small" id="ffApply">Apply</button></div>
            <p class="gde-msg" id="ffMsg" aria-live="polite"></p></details>`;
      box.querySelector("#ffRemove")?.addEventListener("click", () => apply(null));
      const input = box.querySelector("#ffCodeInput"), msg = box.querySelector("#ffMsg");
      const go = async () => {
        const code = input.value.trim();
        if (!code) return;
        msg.className = "gde-msg"; msg.textContent = "Checking...";
        try {
          const r = await fetch(`${API}?action=ffcode-check&code=${encodeURIComponent(code)}`, { credentials: "same-origin" });
          const result = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(result.error || "That code isn't valid.");
          apply({ code: result.code, percent: result.percent });
        } catch (error) { msg.className = "gde-msg error"; msg.textContent = error.message; }
      };
      box.querySelector("#ffApply")?.addEventListener("click", go);
      input?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go(); } });
    }
    window.gdeFFCode = me.collector?.collector ? null : saved;
    draw();
  }

  const statusBox = document.querySelector("#collectorStatus");
  if (page === "checkout.html" || statusBox) {
    (async () => {
      let me = { user: null }, ready = false;
      try {
        const config = await api("config");
        ready = config.ready;
        if (ready) me = await api("me");
      } catch {}
      // null = signed out (checkout offers to sign in); undefined = accounts not working, so nothing is shown.
      window.gdeCollector = me.user ? me.collector : ready ? null : undefined;
      if (page === "checkout.html" && ready) codeBox(me);
      if (typeof renderCheckoutSummary === "function") renderCheckoutSummary();
      if (statusBox && ready) {
        statusBox.innerHTML = collectorBox(me.collector, !!me.user);
        statusBox.hidden = false;
      }
    })();
  }

  // ---- account page
  const root = document.querySelector("#gdeAccount");
  if (!root) return;
  // After signing in from a link like account.html?next=checkout.html, go back there (this site's own pages only).
  const next = new URLSearchParams(location.search).get("next");
  const nextPage = next && /^[a-z0-9-]+\.html$/.test(next) ? next : null;
  // script.js's listings (a top-level const there, so readable by name here, not as window.products).
  const productsRef = typeof products === "object" ? products : null;

  const money = (n) => Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  const day = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); };
  const statusClass = (s) => s === "paid" ? "paid" : ["declined", "voided", "refunded", "not_paid"].includes(s) ? "bad" : "";

  function orderHtml(o) {
    const items = o.items.map((i) => {
      const p = productsRef?.[i.listing];
      const photo = Array.isArray(p?.photos) && p.photos[0] ? ` style="background-image:url('${esc(p.photos[0])}')"` : "";
      const name = p ? `<a href="gun/${encodeURIComponent(i.listing)}.html">${esc(i.name)}</a>` : esc(i.name);
      return `<div class="gde-order-item"><div class="thumb-img"${photo}></div><div>${name}${p ? `<div class="gde-note">${esc(p.platform || "")}${p.finish ? " · " + esc(p.finish) : ""}</div>` : ""}</div><b>${money(i.price)}</b></div>`;
    }).join("");
    return `<article class="gde-order">
      <div class="gde-order-top"><div><strong>${esc(o.invoice)}</strong> <span>${day(o.createdAt)}</span></div><span class="gde-status ${statusClass(o.status)}">${esc(o.statusText)}</span></div>
      ${items}
      <div class="gde-order-foot"><span>${o.ffl?.business ? `Transfer to ${esc(o.ffl.business)}` : "FFL transfer"}${o.test ? " · test order" : ""}</span><span>Total <strong>${money(o.amount)}</strong></span></div>
    </article>`;
  }

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
    document.body.classList.remove("gde-signed-in");
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
          try { await api("google", { credential }); if (nextPage) { location.href = nextPage; return; } await load(); }
          catch (error) { msg.className = "gde-msg error"; msg.textContent = error.message; }
        }
      });
      // As wide as the column (Google's limit is 400 px), white like the site's own main buttons.
      google.accounts.id.renderButton(box, { theme: "outline", size: "large", shape: "rectangular", text: "continue_with", logo_alignment: "center", width: Math.min(400, Math.floor(box.clientWidth) || 320) });
      box.classList.add("ready");
    };
    document.head.append(s);
  }

  // Signed in (user, Nov 8: same clean look as the login): one centered column with the site's menu back on top.
  function renderSignedIn(data) {
    document.body.classList.remove("gde-auth-mode");
    document.body.classList.add("gde-signed-in");
    const u = data.user;
    const first = (u.name || "").split(" ")[0];
    const initial = esc((first || u.email || "?").charAt(0).toUpperCase());
    const orders = data.orders.length
      ? data.orders.map(orderHtml).join("")
      : `<div class="gde-acct-empty"><p>No orders under ${esc(u.email)} yet.</p><a class="button secondary" href="collections.html">Browse Collections</a></div>`;
    root.innerHTML = `<div class="gde-acct">
        <header class="gde-acct-top">
          <div class="gde-avatar" aria-hidden="true">${u.picture ? `<img src="${esc(u.picture)}" alt="" referrerpolicy="no-referrer">` : ""}<span>${initial}</span></div>
          <p class="eyebrow">${data.collector?.tierName || "Collector account"}</p>
          <h1>${first ? `Welcome, ${esc(first)}` : "Welcome"}</h1>
          <p class="gde-acct-email">${esc(u.email)}<span aria-hidden="true">·</span><button class="gde-link-button" id="gdeSignOut" type="button">Sign out</button></p>
        </header>
        ${data.collector ? `<section class="gde-acct-section">
          <h2 class="gde-acct-label">Collector status</h2>
          <div class="collector-status in-account">${collectorBox(data.collector, true)}</div>
          <p class="gde-acct-more"><a href="collectors.html">How collector status works</a></p>
        </section>` : ""}
        ${data.referral ? `<section class="gde-acct-section">
          <h2 class="gde-acct-label">Share your link</h2>
          <div class="ref-share">
            <p>When a friend buys a gun through your link, it counts toward your club too. The link gives them no discount; it's how we know they came from you.</p>
            <div class="ref-link"><input id="refLink" readonly value="${esc(data.referral.link)}" aria-label="Your share link"><button class="button button-small" type="button" id="refCopy">Copy Link</button></div>
            <p class="gde-note">${data.referral.guns ? `${data.referral.guns} gun${data.referral.guns === 1 ? "" : "s"} bought through your link so far.` : "No guns bought through your link yet."}</p>
          </div>
        </section>` : ""}
        ${data.collector?.tier === "legacy" ? `<section class="gde-acct-section">
          <h2 class="gde-acct-label">Friends and family code</h2>
          <div class="ff-code" id="ffCode">${ffCodeHtml(data.ffCode)}</div>
        </section>` : ""}
        <section class="gde-acct-section">
          <h2 class="gde-acct-label">Your orders</h2>
          ${orders}
        </section>
        <section class="gde-acct-section">
          <h2 class="gde-acct-label">Email alerts</h2>
          <div class="gde-acct-row">
            <p>${data.subscribed ? "You're on the collector list: new collections, limited releases and collector offers." : "Get emails about new collections, limited releases and collector offers."}</p>
            <button class="button${data.subscribed ? " secondary" : ""}" id="gdeAlerts" type="button">${data.subscribed ? "Stop Emails" : "Get Email Alerts"}</button>
          </div>
          <p class="gde-msg" id="gdeAlertsMsg" aria-live="polite"></p>
        </section>
        <details class="gde-acct-find">
          <summary>Ordered with a different email? Find an order</summary>
          <form class="gde-auth-form" id="gdeLookup" novalidate>
            <label class="gde-sr" for="gdeLookupEmail">Email used at checkout</label>
            <input id="gdeLookupEmail" type="email" name="email" autocomplete="email" placeholder="Email used at checkout*" required>
            <label class="gde-sr" for="gdeLookupInvoice">Order number</label>
            <input id="gdeLookupInvoice" name="invoice" autocomplete="off" placeholder="Order number* (GDE-0000000000)" required>
            <button class="button secondary" type="submit">Find My Order</button>
            <p class="gde-msg" aria-live="polite"></p>
          </form>
        </details>
        <section class="gde-orders" id="gdeLookupResult"></section>
      </div>`;
    // Google's picture sometimes doesn't load (blocked or expired): the initial shows instead.
    const img = root.querySelector(".gde-avatar img");
    if (img) {
      const ok = () => img.closest(".gde-avatar").classList.add("has-photo");
      img.addEventListener("error", () => img.remove());
      img.complete && img.naturalWidth ? ok() : img.addEventListener("load", ok);
    }
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
    bindFFCode();
    root.querySelector("#refCopy")?.addEventListener("click", async (e) => {
      const input = root.querySelector("#refLink");
      try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand?.("copy"); }
      e.target.textContent = "Copied";
    });
    if (data.listStatus === "none") askToJoin(data.user);
  }

  // Legacy Club: make the friends and family code once, then see it and how many of its 10 uses are left.
  function ffCodeHtml(c) {
    if (!c) {
      return `<p>As a Legacy Club member you get your own code for friends and family: they get 5% off their order with it, up to 10 orders. Choose it once.</p>
        <form class="ff-make" id="ffMake" novalidate><label class="gde-sr" for="ffWanted">Your code</label>
          <input id="ffWanted" name="code" maxlength="20" autocomplete="off" autocapitalize="characters" placeholder="e.g. SMITHFAMILY">
          <button class="button" type="submit">Create My Code</button></form>
        <p class="gde-note">4 to 20 letters or numbers. It can't be changed afterwards.</p>
        <p class="gde-msg" id="ffMakeMsg" aria-live="polite"></p>`;
    }
    const out = c.usesLeft <= 0;
    return `<div class="ff-code-show"><strong>${esc(c.code)}</strong>${out ? "" : `<button class="gde-link-button" type="button" id="ffCopy">Copy</button>`}</div>
      <p>${out ? `All ${c.limit} uses are used. <a href="contact.html">Contact us</a> and we'll set you up with a new code.`
        : `${c.usesLeft} of ${c.limit} uses left. Share it with friends and family: they get ${c.percent}% off their order.`}</p>`;
  }
  function bindFFCode() {
    root.querySelector("#ffCopy")?.addEventListener("click", async (e) => {
      try { await navigator.clipboard.writeText(root.querySelector(".ff-code-show strong").textContent); e.target.textContent = "Copied"; } catch {}
    });
    const form = root.querySelector("#ffMake");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = root.querySelector("#ffMakeMsg"), button = form.querySelector("button");
      button.disabled = true; msg.className = "gde-msg"; msg.textContent = "Creating...";
      try {
        const { ffCode } = await api("ffcode-create", { code: form.code.value });
        root.querySelector("#ffCode").innerHTML = ffCodeHtml(ffCode);
        bindFFCode();
      } catch (error) { button.disabled = false; msg.className = "gde-msg error"; msg.textContent = error.message; }
    });
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
