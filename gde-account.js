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
  const page = "/" + (location.pathname.split("/").pop() || "").toLowerCase().replace(/\.html$/, ""); // "/checkout", or "/" on the home page (clean links, Nov 15)
  const NO_POPUP = ["/checkout", "/payment-success", "/payment-cancel", "/cart", "/account", "/iframe-communicator"];

  const css = document.createElement("link");
  css.rel = "stylesheet"; css.href = "account.css?v=20261117gift2";
  document.head.append(css);

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} }
  };

  // Where this visit came from (script.js keeps it from the first page), sent with each sign-up so the inventory app
  // can say whether a new person came from Google, Instagram, Facebook... (user, Nov 18).
  const SIGNUPS = ["google", "register", "subscribe"];
  const landing = () => { try { return JSON.parse(sessionStorage.getItem("gdeLanding") || "null") || undefined; } catch { return undefined; } };
  async function api(action, body) {
    if (body && SIGNUPS.includes(action) && !body.landing) body = { ...body, landing: landing() };
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
    link.href = "/account"; link.className = "account-nav"; link.setAttribute("aria-label", "Account");
    link.innerHTML = '<svg class="account-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.2-4.2 4.3-6.3 8-6.3s6.8 2.1 8 6.3"/></svg><span>Account</span>';
    if (page === "/account") link.classList.add("active");
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
    acct.href = "/account"; acct.textContent = "My orders";
    footerLinks.append(acct);
  }

  // ---- the welcome offer (api/_welcome.js, user Nov 17: "make the pop up advertise it, and bottom"): a new account or
  // email-list sign-up gets a personal code for money off a first gun. Advertised in the popup and at the bottom of
  // every page while GDE has it on (config.welcome; null when off). Kept for the visit so each page doesn't ask again.
  const giftMoney = (n) => `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  let configP = null;
  function siteConfig() {
    if (!configP) {
      configP = (async () => {
        try { const c = JSON.parse(sessionStorage.getItem("gdeConfig")); if (c && Date.now() - c.at < 10 * 60000) return c.config; } catch {}
        const config = await api("config");
        try { sessionStorage.setItem("gdeConfig", JSON.stringify({ at: Date.now(), config })); } catch {}
        return config;
      })().catch(() => ({})).then((c) => ({ ...c, welcome: c.welcome === undefined ? (LOCAL_PREVIEW ? WELCOME_DEFAULT : null) : c.welcome }));
    }
    return configP;
  }
  // When the site can't say (no answer, or a server from before the offer): no ad on the real site (the offer may be
  // off or waiting for GDE's mailing address); on the local preview, which has no server, it's shown as it will look.
  const WELCOME_DEFAULT = { amount: 100, days: 30 };
  const LOCAL_PREVIEW = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const giftLine = (w) => `${giftMoney(w.amount)} off your first gun`;
  const giftTerms = (w) => `New sign-ups get a personal code by email: once, on a first purchase, within ${w.days} days.`;
  (async () => {
    const footer = document.querySelector(".site-footer");
    // gdeNoGift: this browser's person already has a code or has bought (set by the popup and account page).
    if (!footer || NO_POPUP.includes(page) || store.get("gdeSubscribed") || store.get("gdeNoGift")) return;
    const w = (await siteConfig()).welcome;
    if (!w || document.querySelector(".footer-gift")) return;
    // Its own band just above the footer (inside it, the footer's first-child styles would take it over).
    const band = document.createElement("section");
    band.className = "footer-gift-band";
    band.innerHTML = `<div class="footer-gift"><p class="eyebrow">Welcome gift</p><h3>${giftLine(w)}</h3>
      <p>Join the collector list or create a free account. ${giftTerms(w)}</p>
      <button class="button" type="button">Get My Code</button></div>`;
    band.querySelector("button").addEventListener("click", () => openSignup("footer"));
    footer.before(band);
  })();

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

  // Google's sign-in script, loaded once for the popup and the account page.
  let gsi = null;
  function loadGsi() {
    if (window.google?.accounts?.id) return Promise.resolve();
    return gsi || (gsi = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client"; s.async = true;
      s.onload = resolve;
      s.onerror = () => { gsi = null; reject(new Error("Google sign-in could not load. Check your connection or ad blocker.")); };
      document.head.append(s);
    }));
  }

  // ---- log in / create account, shared by the popup and the account page (user, Nov 15): email + password or
  // Google, with "Create an account" underneath. A new email + password account is only made once the 6-digit code
  // emailed to it is entered (api/account.js), so nobody can take over someone else's orders or club discount.
  // Creating an account has an "Email me..." box (user, Nov 15; unticked = account only, no promotional email); the
  // choice is saved with the account (subscribe or decline), and the inventory app files it as email consent.
  // opts: { config, source, onSignedIn(user, created, list), headings: { <view>: fn } (optional, title per view),
  //         start: the first view (default login; the popup starts on signup while the welcome gift is on) }
  //   list: { chosen: true, subscribed } when they ticked or left the box at sign-up; { chosen: false } on a log-in
  function authPanel(el, opts) {
    const config = opts.config || {};
    let view = opts.start || "login", pending = null; // pending: the sign-up or reset being confirmed by code
    const field = (name, label, type = "text", extra = "") =>
      `<label class="gde-sr" for="gdeA-${name}">${label}</label><input id="gdeA-${name}" name="${name}" type="${type}" placeholder="${label}" ${extra}>`;
    const googleBlock = config.googleClientId ? `<div class="gde-or"><span>or</span></div><div class="gde-google" data-google></div>` : "";
    const views = {
      login: () => `<form class="gde-auth-form" novalidate>
          ${field("email", "Email*", "email", 'autocomplete="email" inputmode="email" required')}
          ${field("password", "Password*", "password", 'autocomplete="current-password" required')}
          <button class="gde-auth-link gde-forgot" type="button" data-view="reset">Forgot password?</button>
          <button class="button" type="submit">Log In</button>
          <p class="gde-msg" aria-live="polite"></p>
        </form>${googleBlock}
        <p class="gde-auth-switch">Don't have an account? <button class="gde-auth-link" type="button" data-view="signup">Create an account</button></p>`,
      signup: () => `<form class="gde-auth-form" novalidate>
          <div class="gde-auth-pair">${field("firstName", "First name*", "text", 'autocomplete="given-name" maxlength="60" required')}${field("lastName", "Last name", "text", 'autocomplete="family-name" maxlength="60"')}</div>
          ${field("email", "Email*", "email", 'autocomplete="email" inputmode="email" required')}
          ${field("password", "Password* (8+ characters)", "password", 'autocomplete="new-password" minlength="8" required')}
          <label class="gde-check"><input type="checkbox" name="emails"><span>Email me about new collections, limited releases and collector offers. Unsubscribe any time.</span></label>
          <button class="button" type="submit">Create Account</button>
          <p class="gde-msg" aria-live="polite"></p>
        </form>${googleBlock}
        <p class="gde-auth-switch">Already have an account? <button class="gde-auth-link" type="button" data-view="login">Log in</button></p>`,
      code: () => `<form class="gde-auth-form" novalidate>
          <p class="gde-auth-note">We sent a 6-digit code to <b>${esc(pending.email)}</b>. Enter it to ${pending.reset ? "set a new password" : "finish creating your account"}.</p>
          ${field("code", "6-digit code*", "text", 'autocomplete="one-time-code" inputmode="numeric" maxlength="6" required')}
          ${pending.reset ? field("password", "New password* (8+ characters)", "password", 'autocomplete="new-password" minlength="8" required') : ""}
          <button class="button" type="submit">${pending.reset ? "Save Password" : "Confirm"}</button>
          <p class="gde-msg" aria-live="polite"></p>
        </form>
        <p class="gde-auth-switch">No email? Check spam, or <button class="gde-auth-link" type="button" data-resend>send a new code</button></p>
        <p class="gde-auth-switch"><button class="gde-auth-link" type="button" data-view="${pending?.reset ? "login" : "signup"}">Back</button></p>`,
      reset: () => `<form class="gde-auth-form" novalidate>
          <p class="gde-auth-note">Enter your account's email and we'll send you a code to set a new password.</p>
          ${field("email", "Email*", "email", 'autocomplete="email" inputmode="email" required')}
          <button class="button" type="submit">Send Code</button>
          <p class="gde-msg" aria-live="polite"></p>
        </form>
        <p class="gde-auth-switch"><button class="gde-auth-link" type="button" data-view="login">Back to log in</button></p>`
    };
    const actions = {
      login: async (f) => { const r = await api("login", { email: f.email.value, password: f.password.value }); await opts.onSignedIn(r.user, false, { chosen: false }); },
      signup: async (f) => {
        const body = { firstName: f.firstName.value, lastName: f.lastName.value, email: f.email.value.trim(), password: f.password.value,
          emails: f.emails.checked, source: opts.source || "account", page: location.pathname };
        await api("register", body);
        pending = body; show("code");
      },
      reset: async (f) => { await api("reset", { email: f.email.value }); pending = { email: f.email.value.trim(), reset: true }; show("code"); },
      code: async (f) => {
        if (pending.reset) {
          const r = await api("reset-finish", { email: pending.email, code: f.code.value, password: f.password.value });
          return opts.onSignedIn(r.user, false, { chosen: false });
        }
        const r = await api("verify", { email: pending.email, code: f.code.value });
        if (r.subscribed) store.set("gdeSubscribed", "1");
        return opts.onSignedIn(r.user, true, { chosen: true, subscribed: !!r.subscribed });
      }
    };
    function show(next) {
      view = next;
      el.innerHTML = views[view]();
      opts.headings?.[view]?.();
      el.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));
      const form = el.querySelector("form"), msg = form.querySelector(".gde-msg");
      const fail = (error) => { msg.className = "gde-msg error"; msg.textContent = error.message; };
      el.querySelector("[data-resend]")?.addEventListener("click", async () => {
        msg.className = "gde-msg"; msg.textContent = "Sending...";
        try { await api(pending.reset ? "reset" : "register", pending); msg.textContent = "New code sent."; } catch (error) { fail(error); }
      });
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const empty = [...form.querySelectorAll("input[required]")].find((i) => !i.value.trim());
        if (empty) { fail(new Error(`Please fill in ${empty.placeholder.replace(/\*.*$/, "").toLowerCase()}.`)); empty.focus(); return; }
        const button = form.querySelector("button[type=submit]");
        button.disabled = true; msg.className = "gde-msg"; msg.textContent = "One moment...";
        try { await actions[view](form); } catch (error) { if (button.isConnected) { button.disabled = false; fail(error); } }
      });
      const box = el.querySelector("[data-google]");
      if (box) renderGoogle(box, view === "signup" ? "signup_with" : "continue_with", fail);
    }
    async function renderGoogle(box, text, fail) {
      try {
        await loadGsi();
        if (!box.isConnected) return;
        google.accounts.id.initialize({
          client_id: config.googleClientId,
          ux_mode: "popup",
          callback: async ({ credential }) => {
            try {
              const r = await api("google", { credential });
              // From the create-account form, the email box counts for a Google sign-up too.
              const box = view === "signup" ? el.querySelector("input[name=emails]") : null;
              if (!box) return await opts.onSignedIn(r.user, false, { chosen: false });
              if (box.checked) { await api("subscribe", { source: opts.source || "account", page: location.pathname }); store.set("gdeSubscribed", "1"); }
              else await api("decline", {});
              await opts.onSignedIn(r.user, false, { chosen: true, subscribed: box.checked });
            } catch (error) { fail(error); }
          }
        });
        google.accounts.id.renderButton(box, { theme: "outline", size: "large", shape: "rectangular", text, logo_alignment: "center", width: Math.min(400, Math.floor(box.clientWidth) || 320) });
        box.classList.add("ready");
      } catch {
        // Google's script blocked (ad blocker, no connection): email + password still works.
        box.previousElementSibling?.remove(); box.remove();
      }
    }
    // The popup (user, Nov 17: "the sign up and save $100 first, then underneath it shows the login"): a plain
    // "Log in" button under the sign-up form instead of the small link, and the way back says what sign-up gives.
    if (opts.loginBelow) {
      const base = { signup: views.signup, login: views.login };
      views.signup = () => base.signup().replace(/<p class="gde-auth-switch">[\s\S]*?<\/p>$/,
        `<div class="gde-auth-other"><span>Already have an account?</span><button class="button secondary" type="button" data-view="login">Log In</button></div>`);
      views.login = () => base.login().replace(/<p class="gde-auth-switch">[\s\S]*?<\/p>$/,
        `<p class="gde-auth-switch">New here? <button class="gde-auth-link" type="button" data-view="signup">${esc(opts.loginBelow)}</button></p>`);
    }
    show(view);
  }

  // The collector list popup (user, Nov 15): log in or create an account (email + password, or Google). The list is
  // the "Email me" box at sign-up; someone logging in who was never asked gets the yes/no question after.
  // Signed in already: one click to join.
  async function openSignup(source) {
    if (popup || document.querySelector(".age-gate")) return;
    popup = document.createElement("div"); // claimed now so a second call can't open another while this one loads
    let config = {}, me = { user: null };
    try { config = await siteConfig(); if (config.ready) me = await api("me"); } catch {}
    if (me.subscribed) store.set("gdeSubscribed", "1");
    if (me.subscribed && source === "popup") { popup = null; return; }
    // The welcome gift, for anyone who can still get one: not on the list, never given a code, never bought.
    if (me.welcomeOffer || (me.orders || []).length) store.set("gdeNoGift", "1");
    const w =!me.subscribed && !me.welcomeOffer && !(me.orders || []).length ? config.welcome : null;
    // Signed in: a gold box over "Join the List". Signed out, the offer is the heading itself (below).
    const gift = w && me.user ? `<div class="gde-gift"><strong>${giftLine(w)}</strong><span>${me.user ? "Join the list and we'll email you a personal code," : "Create a free account and we'll email you a personal code,"} good once on your first gun for ${w.days} days.</span></div>` : "";
    // After signing up: only says a code is on its way when the account really has one (a past buyer gets none).
    const giftDone = async (fallback) => {
      if (!w) return fallback;
      let offer = null;
      try { offer = (await api("me")).welcomeOffer; } catch {}
      if (offer) { store.set("gdeNoGift", "1"); document.querySelector(".footer-gift-band")?.remove(); }
      return offer?.usable ? `Check your email for your ${esc(offer.label)} code (${esc(offer.code)}). ${fallback}` : fallback;
    };
    const body = me.subscribed
      ? `<p class="gde-note">You're already on the list as ${esc(me.user.email)}.</p><a class="button" href="/account">View My Account</a>`
      : me.user
      ? `<button class="button" type="button" id="gdeJoinNow">Join the List</button><p class="gde-msg" aria-live="polite"></p>`
      : `<div class="gde-auth-box"></div>`;
    popup.className = "gde-signup";
    popup.setAttribute("role", "dialog"); popup.setAttribute("aria-modal", "true"); popup.setAttribute("aria-labelledby", "gdeSignupTitle");
    popup.innerHTML = `<div class="gde-signup-panel">
      <button class="gde-signup-close" type="button" aria-label="Close">&times;</button>
      <p class="eyebrow">${w ? "Welcome gift" : "The collector list"}</p>
      ${gift}
      <h2 id="gdeSignupTitle">${me.user ? "First look at new collections" : w ? `Save ${giftMoney(w.amount)} on your first purchase` : "Create your account"}</h2>
      <p class="gde-signup-sub">${me.user ? "New editions, limited releases and collector offers." : "First look at new editions, limited releases and collector offers, plus your orders and collector status in one place."}</p>
      ${body}
      <p class="gde-fine">We never share your email. <a href="/privacy">Privacy</a></p>
      ${me.subscribed ? "" : `<button class="gde-signup-later" type="button">No thanks</button>`}
    </div>`;
    document.body.append(popup);
    requestAnimationFrame(() => popup && popup.classList.add("open"));
    const panel = popup.querySelector(".gde-signup-panel");
    popup.querySelector(".gde-signup-close").addEventListener("click", () => closeSignup(true));
    popup.querySelector(".gde-signup-later")?.addEventListener("click", () => closeSignup(true));
    popup.addEventListener("click", (e) => { if (e.target === popup) closeSignup(true); });
    document.addEventListener("keydown", onKey);
    if (me.subscribed) return;
    // The last screen: what happened, and a way to the account.
    const finish = ({ eyebrow, title, text, account }) => {
      if (!popup) return;
      panel.innerHTML = `<button class="gde-signup-close" type="button" aria-label="Close">&times;</button>
        <div class="gde-done"><p class="eyebrow">${eyebrow}</p><h2>${title}</h2><p>${text}</p>
        ${account ? `<a class="button" href="/account">View My Account</a>` : ""}
        <button class="${account ? "gde-signup-later" : "button"}" type="button" data-close>Continue</button></div>`;
      panel.querySelectorAll(".gde-signup-close,[data-close]").forEach((b) => b.addEventListener("click", () => closeSignup(false)));
    };
    const joinList = async () => { await api("subscribe", { source, page: location.pathname }); store.set("gdeSubscribed", "1"); };
    // Logged in but never asked about the list: ask once, here.
    const askList = () => {
      panel.innerHTML = `<div class="gde-done"><p class="eyebrow">You're logged in</p><h2>Join the collector list?</h2>
        <p>Emails about new collections, limited releases and collector offers. Unsubscribe any time.</p>
        <div class="gde-join-actions"><button class="button" type="button" data-join="yes">Yes, add me</button>
        <button class="gde-signup-later" type="button" data-join="no">No thanks</button></div><p class="gde-msg" aria-live="polite"></p></div>`;
      panel.querySelectorAll("[data-join]").forEach((b) => b.addEventListener("click", async () => {
        const yes = b.dataset.join === "yes", msg = panel.querySelector(".gde-msg");
        panel.querySelectorAll("[data-join]").forEach((x) => (x.disabled = true));
        try {
          if (yes) await joinList(); else await api("decline", {});
          finish(yes ? { eyebrow: "You're on the list", title: "Thank you", text: await giftDone("You'll hear about the next collection first."), account: true }
            : { eyebrow: "You're logged in", title: "Welcome back", text: "Your orders and collector status are in your account.", account: true });
        } catch (error) {
          panel.querySelectorAll("[data-join]").forEach((x) => (x.disabled = false));
          msg.className = "gde-msg error"; msg.textContent = error.message;
        }
      }));
    };

    if (me.user) {
      const button = popup.querySelector("#gdeJoinNow"), msg = popup.querySelector(".gde-msg");
      button.addEventListener("click", async () => {
        button.disabled = true; msg.className = "gde-msg"; msg.textContent = "Joining...";
        try {
          await joinList();
          finish({ eyebrow: "You're on the list", title: "Thank you", text: await giftDone("You'll hear about the next collection first.") });
        } catch (error) { button.disabled = false; msg.className = "gde-msg error"; msg.textContent = error.message; }
      });
      return;
    }

    // Sign-up first, log-in under it (user, Nov 17): the popup opens on "Save $100 on your first purchase" and the
    // create-account form; "Already have an account? Log In" sits underneath.
    const title = panel.querySelector("#gdeSignupTitle"), sub = panel.querySelector(".gde-signup-sub"), eyebrow = panel.querySelector(".eyebrow");
    const plainSub = sub.textContent;
    const offerSub = w ? `Create a free account and we'll email you a personal code for ${giftMoney(w.amount)} off your first gun, good for ${w.days} days. Plus first look at new editions and your orders in one place.` : plainSub;
    const heading = (t, withSub, text = plainSub, eb = "The collector list") => () => { title.textContent = t; sub.textContent = text; sub.hidden = !withSub; sub.classList.toggle("offer", text === offerSub && !!w); eyebrow.textContent = eb; };
    authPanel(panel.querySelector(".gde-auth-box"), {
      config, source, start: "signup", loginBelow: w ? `Create an account and save ${giftMoney(w.amount)}` : "Create an account",
      headings: { login: heading("Log in", true), signup: w ? heading(`Save ${giftMoney(w.amount)} on your first purchase`, true, offerSub, "Welcome gift") : heading("Create your account", true),
        code: heading("Check your email"), reset: heading("Reset your password") },
      onSignedIn: async (user, created, list) => {
        if (list.chosen) {
          const text = `${list.subscribed ? "You'll hear about the next collection first. " : ""}Your orders and collector status are in your account.`;
          return finish({ eyebrow: created ? "Your account is ready" : "You're signed in", title: "Thank you", account: true,
            text: created ? await giftDone(text) : text });
        }
        let status = "none";
        try { status = (await api("me")).listStatus || "none"; } catch {}
        if (status === "subscribed") store.set("gdeSubscribed", "1");
        if (status === "none") return askList();
        finish({ eyebrow: "You're logged in", title: "Welcome back", text: "Your orders and collector status are in your account.", account: true });
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
        <a class="button" href="/account?next=collectors">Sign In</a>`;
    }
    const nextLine = st.next ? ` Buy ${guns(st.next.toGo)} to join the ${st.next.name}, with ${st.next.percent}% off every purchase after that.` : "";
    if (st.collector) {
      return `<p class="eyebrow">Your status</p><h3>You're in the ${st.tierName}</h3>${pips(st)}
        <p>${st.guns} guns${st.referred ? `, ${st.referred} of them bought by friends through your link` : ""}. You get ${st.percent}% off every purchase, taken off at checkout while you're signed in.${nextLine}</p>
        <a class="button" href="/collections">Browse Collections</a>`;
    }
    return `<p class="eyebrow">Your status</p><h3>${st.guns} of ${st.next.guns} guns</h3>${pips(st)}
      <p>${st.referred ? `${st.referred} of your guns ${st.referred === 1 ? "was" : "were"} bought by friends through your link. ` : ""}${guns(st.next.toGo).replace(/^o/, "O")} and you join the ${st.next.name}, with ${st.next.percent}% off every purchase after that.${st.guns >= 1 ? " Friends who buy through your link count too." : ""}</p>
      <a class="button" href="/collections">Browse Collections</a>`;
  }
  window.gdeCollectorBox = collectorBox;

  // ---- discount code at checkout: GDE's own codes (api/_promo.js; a club member gets whichever saves more) or a
  // friends and family code (api/_ffcode.js; 5% off, only for buyers with no club discount of their own), or the
  // buyer's welcome code (api/_welcome.js; filled in for a signed-in buyer who has one, unless they removed it).
  // Kept for the visit in sessionStorage; the payment API checks it again before taking the payment.
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
      draw();
      if (typeof renderCheckoutSummary === "function") renderCheckoutSummary();
    };
    const club = me.collector?.collector ? me.collector : null;
    function draw() {
      const c = window.gdeFFCode;
      const clubNote = club ? `<p class="ff-note">Your ${esc(club.tierName)} discount is applied. A discount code only replaces it if the code saves you more.</p>` : "";
      box.innerHTML = c
        ? `<p class="ff-applied"><span>Code <b>${esc(c.code)}</b> applied${c.label ? ` (${esc(c.label)})` : ""}</span><button type="button" class="gde-link-button" id="ffRemove">Remove</button></p>
           <p class="ff-note" id="ffBest" hidden></p>`
        : `${clubNote}<details class="ff-enter"><summary>Have a discount code?</summary>
            <div class="ff-row"><label class="gde-sr" for="ffCodeInput">Discount code</label><input id="ffCodeInput" autocomplete="off" autocapitalize="characters" maxlength="20" placeholder="Code"><button type="button" class="button button-small" id="ffApply">Apply</button></div>
            <p class="gde-msg" id="ffMsg" aria-live="polite"></p></details>`;
      box.querySelector("#ffRemove")?.addEventListener("click", () => {
        try { sessionStorage.setItem("gdeCodeRemoved", "1"); } catch {}
        apply(null);
      });
      const input = box.querySelector("#ffCodeInput"), msg = box.querySelector("#ffMsg");
      const go = async () => {
        const code = input.value.trim();
        if (!code) return;
        msg.className = "gde-msg"; msg.textContent = "Checking...";
        try {
          // The email typed so far: welcome codes only work with the email they were sent to.
          const email = document.querySelector('#purchaseForm [name="email"]')?.value.trim() || "";
          const r = await fetch(`${API}?action=code-check&code=${encodeURIComponent(code)}${email ? `&email=${encodeURIComponent(email)}` : ""}`, { credentials: "same-origin" });
          const result = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(result.error || "That code isn't valid.");
          if (result.type === "ffcode" && club) throw new Error(`Friends and family codes are for buyers who aren't in a club. Your ${club.tierName} discount is already applied.`);
          apply({ type: result.type, code: result.code, kind: result.kind, value: result.value, percent: result.percent, label: result.label });
        } catch (error) { msg.className = "gde-msg error"; msg.textContent = error.message; }
      };
      box.querySelector("#ffApply")?.addEventListener("click", go);
      input?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go(); } });
    }
    // Called by the order summary (script.js) with what the buyer pays: says so when the club discount beats the code.
    window.gdeCodeNote = (pay) => {
      const note = box.querySelector("#ffBest");
      if (!note) return;
      const clubWins = !!(club && window.gdeFFCode && pay && !pay.code);
      note.hidden = !clubWins;
      note.textContent = clubWins ? `Your ${club.tierName} discount saves you more than this code, so that's the one used.` : "";
    };
    // A friends and family code saved earlier doesn't apply to a club member; GDE's own codes and welcome codes do.
    window.gdeFFCode = club && !["promo", "welcome"].includes(saved?.type) ? null : saved;
    // A signed-in buyer's own welcome code goes in by itself (they can remove it).
    const w = me.welcomeOffer;
    let removed = false;
    try { removed = sessionStorage.getItem("gdeCodeRemoved") === "1"; } catch {}
    if (!window.gdeFFCode && !removed && w?.usable) {
      window.gdeFFCode = { type: "welcome", code: w.code, kind: "amount", value: w.amount, label: w.label };
    }
    draw();
  }

  const statusBox = document.querySelector("#collectorStatus");
  if (page === "/checkout" || statusBox) {
    (async () => {
      let me = { user: null }, ready = false;
      try {
        const config = await api("config");
        ready = config.ready;
        if (ready) me = await api("me");
      } catch {}
      // null = signed out (checkout offers to sign in); undefined = accounts not working, so nothing is shown.
      window.gdeCollector = me.user ? me.collector : ready ? null : undefined;
      if (page === "/checkout" && ready) codeBox(me);
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
  // After signing in from a link like /account?next=checkout, go back there (this site's own pages only).
  const next = new URLSearchParams(location.search).get("next");
  const nextPage = next && /^\/?[a-z0-9-]+(\.html)?$/.test(next) ? "/" + next.replace(/^\//, "").replace(/\.html$/, "") : null;
  // script.js's listings (a top-level const there, so readable by name here, not as window.products).
  const productsRef = typeof products === "object" ? products : null;

  const money = (n) => Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  const day = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); };
  const statusClass = (s) => s === "paid" ? "paid" : ["declined", "voided", "refunded", "not_paid"].includes(s) ? "bad" : "";

  function orderHtml(o) {
    const items = o.items.map((i) => {
      const p = productsRef?.[i.listing];
      const photo = Array.isArray(p?.photos) && p.photos[0] ? ` style="background-image:url('${esc(p.photos[0])}')"` : "";
      const name = p ? `<a href="/gun/${encodeURIComponent(i.listing)}">${esc(i.name)}</a>` : esc(i.name);
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
        <a class="gde-auth-back" href="/"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>Back to website</a>
        <a class="gde-auth-logo" href="/" aria-label="GDE Collectibles home"></a>
        <h1 class="gde-auth-title">Collector Login</h1>
        <p class="gde-auth-sub">Track your orders, follow your FFL transfer and get the first look at new collections.</p>
        <div class="gde-auth-box" id="gdeAuthBox"></div>
        <div class="gde-or"><span>or find an order</span></div>
        <form class="gde-auth-form" id="gdeLookup" novalidate>
          <label class="gde-sr" for="gdeLookupEmail">Email used at checkout</label>
          <input id="gdeLookupEmail" type="email" name="email" autocomplete="email" placeholder="Email used at checkout*" required>
          <label class="gde-sr" for="gdeLookupInvoice">Order number</label>
          <input id="gdeLookupInvoice" name="invoice" autocomplete="off" placeholder="Order number* (GDE-0000000000)" required>
          <button class="button secondary" type="submit">Find My Order</button>
          <p class="gde-msg" aria-live="polite"></p>
        </form>
        <p class="gde-auth-foot">Need help with an order? <a href="/contact">Contact us</a></p>
        <p class="gde-auth-fine">With Google we only receive your name and email, never your password.</p>
      </div>
      <section class="gde-orders" id="gdeLookupResult"></section>`;
    bindLookup();
    const title = root.querySelector(".gde-auth-title"), sub = root.querySelector(".gde-auth-sub");
    const heading = (t, withSub) => () => { title.textContent = t; sub.hidden = !withSub; };
    authPanel(root.querySelector("#gdeAuthBox"), {
      config, source: "account",
      headings: { login: heading("Collector Login", true), signup: heading("Create Account", true), code: heading("Check Your Email"), reset: heading("Reset Password") },
      onSignedIn: async () => { if (nextPage) { location.href = nextPage; return; } await load(); }
    });
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
      : `<div class="gde-acct-empty"><p>No orders under ${esc(u.email)} yet.</p><a class="button secondary" href="/collections">Browse Collections</a></div>`;
    root.innerHTML = `<div class="gde-acct">
        <header class="gde-acct-top">
          <div class="gde-avatar" aria-hidden="true">${u.picture ? `<img src="${esc(u.picture)}" alt="" referrerpolicy="no-referrer">` : ""}<span>${initial}</span></div>
          <p class="eyebrow">${data.collector?.tierName || "Collector account"}</p>
          <h1>${first ? `Welcome, ${esc(first)}` : "Welcome"}</h1>
          <p class="gde-acct-email">${esc(u.email)}<span aria-hidden="true">·</span><button class="gde-link-button" id="gdeSignOut" type="button">Sign out</button></p>
        </header>
        ${data.welcomeOffer?.usable ? `<section class="gde-acct-section">
          <h2 class="gde-acct-label">Your welcome gift</h2>
          <div class="ff-code welcome-gift">
            <p>${esc(data.welcomeOffer.label)} your first gun. It's filled in for you at checkout while you're signed in.</p>
            <div class="ff-code-show"><strong>${esc(data.welcomeOffer.code)}</strong></div>
            <p class="gde-note">Good until ${esc(new Date(data.welcomeOffer.endsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }))}, once, with ${esc(u.email)}.</p>
          </div>
        </section>` : ""}
        ${data.collector ? `<section class="gde-acct-section">
          <h2 class="gde-acct-label">Collector status</h2>
          <div class="collector-status in-account">${collectorBox(data.collector, true)}</div>
          <p class="gde-acct-more"><a href="/collectors">How collector status works</a></p>
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
      <p>${out ? `All ${c.limit} uses are used. <a href="/contact">Contact us</a> and we'll set you up with a new code.`
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
