const products = {
  "trump-250-anniversary": {
    "name": "TRUMP 250 Anniversary",
    "collection": "TRUMP 250 Anniversary",
    "type": "Pistol",
    "manufacturer": "Colt",
    "model": "Colt M1911",
    "caliber": ".45 ACP",
    "platform": ".45 ACP",
    "frameColor": "Silver/Gold",
    "gripColor": "Gold",
    "action": "Semi-Automatic",
    "adjustableSights": "",
    "barrelLength": "5 inches",
    "capacity": "7+1",
    "frameMaterial": "Stainless Steel",
    "gripMaterial": "",
    "finish": "Polished Stainless Steel",
    "price": "$4,000",
    "availability": "Available",
    "image": "image-gold",
    "description": "TRUMP 250 Anniversary Colt M1911 chambered in .45 ACP with polished stainless steel finish, silver and gold frame coloration, gold grips, and commemorative collector styling.",
    "photos": [
      "assets/listings/trump-250-anniversary/trump-250-01.jpeg",
      "assets/listings/trump-250-anniversary/trump-250-02.jpeg",
      "assets/listings/trump-250-anniversary/trump-250-03.jpeg",
      "assets/listings/trump-250-anniversary/trump-250-04.jpeg",
      "assets/listings/trump-250-anniversary/trump-250-05.jpeg",
      "assets/listings/trump-250-anniversary/trump-250-06.jpeg",
      "assets/listings/trump-250-anniversary/trump-250-07.jpeg",
      "assets/listings/trump-250-anniversary/trump-250-08.jpeg",
      "assets/listings/trump-250-anniversary/trump-250-09.jpeg",
      "assets/listings/trump-250-anniversary/trump-250-10.jpeg",
      "assets/listings/trump-250-anniversary/trump-250-11.jpeg",
      "assets/listings/trump-250-anniversary/trump-250-12.jpeg",
      "assets/listings/trump-250-anniversary/trump-250-13.jpeg"
    ]
  },
  "remember-the-alamo": {
    "name": "Remember the Alamo",
    "collection": "Remember the Alamo",
    "type": "Pistol",
    "manufacturer": "Colt",
    "model": "Colt M1911",
    "caliber": ".45 ACP (.45 Auto)",
    "platform": ".45 ACP",
    "frameColor": "Stainless Steel",
    "gripColor": "Composite Brown Pearl",
    "action": "Semi-Automatic",
    "adjustableSights": "",
    "barrelLength": "5",
    "capacity": "",
    "frameMaterial": "Stainless Steel",
    "gripMaterial": "Composite Brown Pearl with Colt gold Horse",
    "condition": "NEW",
    "metalCondition": "Stainless Steel",
    "engraving": "Custom Collectibles",
    "case": "Display Case Walnut",
    "finish": "High Gloss Stainless Steel Polish & 24K Gold Icons",
    "price": "$3,500",
    "availability": "Available",
    "image": "image-gold",
    "description": "Remember the Alamo Colt M1911 chambered in .45 ACP (.45 Auto), presented in high gloss stainless steel polish with 24K gold icons, Custom Collectibles engraving, composite brown pearl grips with Colt gold Horse, and a walnut display case.",
    "photos": [
      "assets/listings/remember-the-alamo/remember-alamo-01.jpeg",
      "assets/listings/remember-the-alamo/remember-alamo-02.jpeg",
      "assets/listings/remember-the-alamo/remember-alamo-03.jpeg",
      "assets/listings/remember-the-alamo/remember-alamo-04.jpeg",
      "assets/listings/remember-the-alamo/remember-alamo-05.jpeg",
      "assets/listings/remember-the-alamo/remember-alamo-06.jpeg",
      "assets/listings/remember-the-alamo/remember-alamo-07.jpeg",
      "assets/listings/remember-the-alamo/remember-alamo-08.jpeg",
      "assets/listings/remember-the-alamo/remember-alamo-09.jpeg",
      "assets/listings/remember-the-alamo/remember-alamo-10.jpeg",
      "assets/listings/remember-the-alamo/remember-alamo-11.jpeg",
      "assets/listings/remember-the-alamo/remember-alamo-12.jpeg",
      "assets/listings/remember-the-alamo/remember-alamo-13.jpeg",
      "assets/listings/remember-the-alamo/remember-alamo-14.jpeg",
      "assets/listings/remember-the-alamo/remember-alamo-15.jpeg"
    ]
  }
};
const priceNumber = value => Number(value.replace(/[$,]/g,""));
const getCart = () => {
  try { return JSON.parse(localStorage.getItem("gdeRequestCart")) || []; }
  catch { return []; }
};
const saveCart = cart => {
  localStorage.setItem("gdeRequestCart", JSON.stringify(cart));
  updateCartCount();
  document.querySelectorAll(".cart-nav").forEach(link => link.href = cart.length ? `cart.html?cart=${cart.join(",")}` : "cart.html");
};
const updateCartCount = () => document.querySelectorAll(".cart-count").forEach(el => el.textContent = getCart().length);
const cartIconMarkup = '<svg class="cart-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.1 10.1a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.4L21 8H7"/><circle cx="10" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/></svg><span class="cart-label">Cart</span><span class="cart-count">0</span>';
const addToCart = itemKey => {
  const cart = getCart();
  if (!cart.includes(itemKey) && products[itemKey] && !products[itemKey].availability.includes("Archive")) cart.push(itemKey);
  saveCart(cart);
  return cart.includes(itemKey);
};
const incomingCart = new URLSearchParams(location.search).get("cart");
if (incomingCart) {
  const validIncoming = incomingCart.split(",").filter(item => products[item] && !products[item].availability.includes("Archive"));
  localStorage.setItem("gdeRequestCart", JSON.stringify([...new Set(validIncoming)]));
}
updateCartCount();
document.querySelectorAll(".site-nav").forEach(nav => {
  const collectionsLink = nav.querySelector('a[href="collections.html"]');
  if (collectionsLink && !nav.querySelector(".collections-menu")) {
    const collectionMenu = document.createElement("div");
    collectionMenu.className = "nav-dropdown collections-menu";
    collectionMenu.innerHTML = `<button class="nav-dropdown-toggle" type="button" aria-expanded="false">Collections <span>&or;</span></button>
      <div class="nav-dropdown-panel">
        <a href="collections.html">All Collections</a>
        <p>Platform</p>
        <a href="collections.html?platform=45-acp">.45 ACP</a>
        <a href="collections.html?platform=38-special">.38 Special</a>
        <p>Individual collections</p>
        <a href="collections.html?item=trump-250-anniversary">TRUMP 250 Anniversary</a>
        <a href="collections.html?item=remember-the-alamo">Remember the Alamo</a>
      </div>`;
    collectionsLink.replaceWith(collectionMenu);
  }
  if (!nav.querySelector(".marketplaces-menu")) {
    const marketplaceMenu = document.createElement("div");
    marketplaceMenu.className = "nav-dropdown marketplaces-menu";
    marketplaceMenu.innerHTML = `<button class="nav-dropdown-toggle" type="button" aria-expanded="false">Marketplaces <span>&or;</span></button>
      <div class="nav-dropdown-panel external-panel">
        <a href="https://www.gunbroker.com/" target="_blank" rel="noopener noreferrer">GUNBROKER <span>&nearr;</span></a>
        <a href="https://www.gunsinternational.com/" target="_blank" rel="noopener noreferrer">GUNS INTERNATIONAL <span>&nearr;</span></a>
      </div>`;
    const action = nav.querySelector(".button");
    action ? nav.insertBefore(marketplaceMenu, action) : nav.appendChild(marketplaceMenu);
  }
  const homeLink = nav.querySelector('a[href="index.html"]');
  const collectionsMenu = nav.querySelector(".collections-menu");
  const marketplacesMenu = nav.querySelector(".marketplaces-menu");
  const complianceLink = nav.querySelector('a[href="#compliance"], a[href="index.html#compliance"]');
  const contactLink = nav.querySelector('a[href="contact.html"], a[href="#contact"], a[href="index.html#contact"], a[href="#inquiry"]');
  const headerAction = nav.querySelector(".button");
  [homeLink, collectionsMenu, marketplacesMenu, complianceLink, contactLink, headerAction].forEach(item => {
    if (item) nav.appendChild(item);
  });
});
document.querySelectorAll(".cart-nav").forEach(link => link.innerHTML = cartIconMarkup);
updateCartCount();
document.querySelectorAll(".nav-dropdown-toggle").forEach(toggle => toggle.addEventListener("click", event => {
  event.stopPropagation();
  const dropdown = toggle.closest(".nav-dropdown");
  document.querySelectorAll(".nav-dropdown.open").forEach(open => { if (open !== dropdown) { open.classList.remove("open"); open.querySelector(".nav-dropdown-toggle").setAttribute("aria-expanded","false"); }});
  const open = dropdown.classList.toggle("open");
  toggle.setAttribute("aria-expanded", String(open));
}));
document.addEventListener("click", () => document.querySelectorAll(".nav-dropdown.open").forEach(open => {
  open.classList.remove("open"); open.querySelector(".nav-dropdown-toggle").setAttribute("aria-expanded","false");
}));
document.querySelectorAll('.site-nav a[href="#contact"], .site-nav a[href="index.html#contact"], .footer-links a[href="#contact"], .footer-links a[href="index.html#contact"], .site-nav a[href="#inquiry"]').forEach(link => link.href = "contact.html");
document.querySelectorAll(".site-footer").forEach(footer => {
  const brandColumn = footer.querySelector(":scope > div:first-child");
  brandColumn?.querySelector(":scope > p")?.remove();
  const footerLinks = footer.querySelector(".footer-links");
  if (footerLinks) {
    footerLinks.innerHTML = `
      <a href="index.html">Home</a>
      <a href="collections.html">Collections</a>
      <a href="cart.html">Cart</a>
      <a href="checkout.html">Checkout</a>
      <a href="contact.html">Contact</a>
      <a href="index.html#compliance">Compliance</a>
      <a href="privacy.html">Privacy Policy</a>
      <a href="terms.html">Terms of Service</a>
      <a href="refund.html">Refund Policy</a>`;
  }
  const legal = footer.querySelector(".footer-legal");
  if (legal && !legal.querySelector(".footer-contact")) legal.insertAdjacentHTML("afterbegin", '<div class="footer-contact"><strong>Contact Us</strong><a href="tel:+17869313566">Phone: 1-786-931-3566</a><a href="mailto:gdecollectibles@gmail.com">Email: gdecollectibles@gmail.com</a><div><a href="privacy.html">Privacy Policy</a><span>|</span><a href="terms.html">Terms of Service</a></div></div>');
});

if (!sessionStorage.getItem("gdeAgeConfirmed")) {
  document.body.classList.add("age-locked");
  document.body.insertAdjacentHTML("beforeend", '<div class="age-gate" role="dialog" aria-modal="true" aria-labelledby="ageTitle"><div class="age-panel"><div class="age-logo" aria-hidden="true"></div><p class="eyebrow">Age verification</p><h2 id="ageTitle">Are you 21 or older?</h2><p>You must be at least 21 years old to enter GDE Collectibles.</p><div class="age-actions"><button class="button" id="ageConfirm" type="button">Yes, I am 21+</button><button class="button secondary" id="ageDeny" type="button">No, exit</button></div><small>By entering, you confirm that you meet the legal age requirements in your jurisdiction.</small></div></div>');
  document.querySelector("#ageConfirm").addEventListener("click", () => {
    sessionStorage.setItem("gdeAgeConfirmed","true"); document.querySelector(".age-gate").remove(); document.body.classList.remove("age-locked");
  });
  document.querySelector("#ageDeny").addEventListener("click", () => {
    document.querySelector(".age-panel").innerHTML='<p class="eyebrow">Access restricted</p><h2>You must be 21+ to enter.</h2><p>Please leave this website.</p>';
  });
}
if (!document.querySelector(".cart-page")) {
  const headerAction = document.querySelector(".site-nav .button");
  if (headerAction) {
    headerAction.href = "cart.html";
    headerAction.classList.add("cart-nav");
    headerAction.innerHTML = cartIconMarkup;
    updateCartCount();
  }
}
document.querySelector(".nav-toggle")?.addEventListener("click", e => {
  const nav = document.querySelector(".site-nav");
  const open = nav.classList.toggle("open");
  e.currentTarget.setAttribute("aria-expanded", open);
});

const reveals = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add("visible"); observer.unobserve(entry.target); }
  }), {threshold:.12});
  reveals.forEach(el => observer.observe(el));
} else reveals.forEach(el => el.classList.add("visible"));

const cards = [...document.querySelectorAll(".product-card")];
cards.forEach(card => {
  card.querySelector(".ffl-note")?.remove();
  const productLink = card.querySelector('a[href*="product="]');
  const itemKey = productLink ? new URL(productLink.href).searchParams.get("product") : "";
  const item = products[itemKey];
  if (!item) return;
  card.dataset.product = itemKey;
  card.dataset.platform = item.platform === ".38 Special" ? "38-special" : "45-acp";
  const meta = card.querySelector(".meta");
  if (meta) meta.textContent = `${item.collection.replace(" Collection","")} · ${item.platform} · ${item.finish}`;
});
const priceRange = document.querySelector("#priceRange");
if (cards.length) {
  const catalogParams = new URLSearchParams(location.search);
  const requestedPlatform = catalogParams.get("platform");
  const requestedType = catalogParams.get("type");
  const requestedItem = catalogParams.get("item");
  if (requestedPlatform) document.querySelector(`input[name="platform"][value="${requestedPlatform}"]`)?.setAttribute("checked","");
  if (requestedType) document.querySelector(`input[name="type"][value="${requestedType}"]`)?.setAttribute("checked","");
  if (requestedItem) document.querySelector(`input[name="product"][value="${requestedItem}"]`)?.setAttribute("checked","");
  const applyFilters = () => {
    const groups = ["product","type","platform","finish","availability"];
    const selected = Object.fromEntries(groups.map(group => [group,[...document.querySelectorAll(`input[name="${group}"]:checked`)].map(el => el.value)]));
    const maxPrice = Number(priceRange.value);
    let visible = 0;
    cards.forEach(card => {
      const matches = groups.every(group => !selected[group].length || selected[group].includes(card.dataset[group])) && Number(card.dataset.price) <= maxPrice;
      card.classList.toggle("is-hidden", !matches);
      if (matches) visible++;
    });
    document.querySelector("#priceValue").textContent = `$${maxPrice.toLocaleString()}`;
    const selectedProducts = selected.product.length;
    document.querySelector("#resultsLabel").textContent = selectedProducts ? `Showing ${visible} selected collection${visible===1?"":"s"}` : maxPrice < 5000 ? `Showing ${visible} collection${visible===1?"":"s"} up to $${maxPrice.toLocaleString()}` : `Showing ${visible} of ${cards.length} collections`;
    document.querySelector("#noResults").classList.toggle("show", visible === 0);
  };
  document.querySelectorAll(".filters input").forEach(input => input.addEventListener("input", applyFilters));
  document.querySelector(".reset-filters").addEventListener("click", () => {
    document.querySelectorAll('.filters input[type="checkbox"]').forEach(input => input.checked = false);
    priceRange.value = priceRange.max;
    if (requestedItem || requestedPlatform || requestedType) history.replaceState({}, "", "collections.html");
    location.reload();
  });
  document.querySelector(".mobile-filter-button")?.addEventListener("click", () => document.querySelector(".filters").classList.add("open"));
  document.querySelector(".filter-close")?.addEventListener("click", () => document.querySelector(".filters").classList.remove("open"));
  applyFilters();
}

const key = new URLSearchParams(location.search).get("product");
const product = (key && products[key]) || Object.values(products)[0];
function setText(selector, text){ const el=document.querySelector(selector); if(el) el.textContent=text; }
function applyProductPhoto(el, item, index = 0) {
  if (!el || !item) return;
  Object.values(products).forEach(p => { if (p.image) el.classList.remove(p.image); });
  const photos = Array.isArray(item.photos) ? item.photos : [];
  if (photos[index]) {
    el.style.backgroundImage = `url("${photos[index]}")`;
    el.classList.add("has-photo");
  } else {
    el.style.backgroundImage = "";
    el.classList.remove("has-photo");
    if (item.image) el.classList.add(item.image);
  }
}
function setImage(selector){ const el=document.querySelector(selector); applyProductPhoto(el, product, 0); }
function setProductGallery(item) {
  const gallery = document.querySelector(".detail-gallery");
  const detailImage = document.querySelector("#detailImage");
  const row = document.querySelector(".thumb-row");
  if (!gallery || !detailImage || !row || !item) return;
  const photos = Array.isArray(item.photos) ? item.photos : [];
  if (!photos.length) return;
  row.innerHTML = photos.map((photo, index) => `<button class="thumb${index === 0 ? " active" : ""}" type="button" aria-label="View product photo ${index + 1}" style="background-image:url('${photo}')"></button>`).join("");
  row.querySelectorAll(".thumb").forEach((button, index) => {
    button.addEventListener("click", () => {
      row.querySelectorAll(".thumb").forEach(thumb => thumb.classList.remove("active"));
      button.classList.add("active");
      applyProductPhoto(detailImage, item, index);
    });
  });
}
function productImageStyle(item) {
  const photos = Array.isArray(item?.photos) ? item.photos : [];
  return photos[0] ? ` style="background-image:url('${photos[0]}')"` : "";
}
function setExtraSpecs(item) {
  const specList = document.querySelector(".spec-list");
  if (!specList || !item) return;
  specList.querySelectorAll("[data-extra-spec]").forEach(row => row.remove());
  const specs = [
    ["Manufacturer", item.manufacturer],
    ["Model", item.model],
    ["Caliber", item.caliber],
    ["Frame color", item.frameColor],
    ["Grip color", item.gripColor],
    ["Condition", item.condition],
    ["Metal condition", item.metalCondition],
    ["Engraving", item.engraving],
    ["Case", item.case],
    ["Action", item.action],
    ["Adjustable sights", item.adjustableSights],
    ["Barrel length", item.barrelLength],
    ["Capacity", item.capacity],
    ["Frame material", item.frameMaterial],
    ["Grip material", item.gripMaterial]
  ].filter(([, value]) => value);
  specs.forEach(([label, value]) => {
    specList.insertAdjacentHTML("beforeend", `<div data-extra-spec><dt>${label}</dt><dd>${value}</dd></div>`);
  });
}
if (document.querySelector(".product-detail-page")) {
  const request=document.querySelector("#detailRequest");
  if (!product) {
    document.title = "No active listings | GDE Collectibles";
    setText("#detailCollection", "Inventory update");
    setText("#detailName", "No active listings");
    setText("#detailPrice", "");
    setText("#detailPlatform", "—");
    setText("#detailFinish", "—");
    setText("#detailAvailability", "Coming soon");
    setText("#detailDescription", "Current listings have been cleared while GDE Collectibles prepares the next private release.");
    if (request) {
      request.textContent = "Contact Us";
      request.classList.remove("add-to-cart");
      request.addEventListener("click", () => location.href = "contact.html");
    }
  } else {
    document.title = `${product.name} | GDE Collectibles`;
    setText("#detailCollection",product.collection); setText("#detailName",product.name); setText("#detailPrice",product.price); setText("#detailPlatform",product.platform); setText("#detailFinish",product.finish); setText("#detailAvailability",product.availability); setText("#detailDescription",product.description); setImage("#detailImage"); setProductGallery(product); setExtraSpecs(product);
    if (request) request.dataset.product=key || Object.keys(products)[0];
    if(product.availability.includes("Archive") && request){request.textContent="Archive - Unavailable";request.disabled=true;}
  }
}

document.querySelectorAll('a[href^="checkout.html?product="]').forEach(link => {
  const itemKey = new URL(link.href).searchParams.get("product");
  link.textContent = "ADD TO CART";
  link.addEventListener("click", event => {
    event.preventDefault();
    addToCart(itemKey);
    link.textContent = "Added - View Cart";
    link.href = "cart.html";
    link.addEventListener("click", () => location.href="cart.html", {once:true});
  });
});
document.querySelectorAll(".add-to-cart").forEach(button => button.addEventListener("click", () => {
  if (!addToCart(button.dataset.product)) return;
  button.textContent = "Added - View Cart";
  button.classList.add("added");
  setTimeout(() => location.href="cart.html", 450);
}));

function renderCart() {
  const container = document.querySelector("#cartItems");
  if (!container) return;
  const cart = getCart().filter(item => products[item]);
  document.querySelector("#cartItemCount").textContent = `${cart.length} item${cart.length===1?"":"s"}`;
  document.querySelector("#emptyCart").classList.toggle("show", cart.length === 0);
  container.innerHTML = cart.map(item => {
    const p=products[item];
    return `<article class="cart-item"><div class="cart-item-image ${p.image}"${productImageStyle(p)}></div><div class="cart-item-copy"><p class="meta">${p.collection}</p><h2>${p.name}</h2><p>${p.platform} · ${p.finish} · ${p.availability}</p><span>FFL Transfer Required</span></div><div class="cart-item-price"><strong>${p.price}</strong><button type="button" class="remove-cart-item" data-product="${item}">Remove</button></div></article>`;
  }).join("");
  const total = cart.reduce((sum,item)=>sum+priceNumber(products[item].price),0);
  document.querySelector("#cartTotal").textContent = `$${total.toLocaleString()}`;
  const checkoutButton=document.querySelector("#checkoutButton");
  checkoutButton.classList.toggle("disabled",cart.length===0);
  checkoutButton.setAttribute("aria-disabled",cart.length===0);
  checkoutButton.href=cart.length ? `checkout.html?cart=${cart.join(",")}` : "checkout.html";
  container.querySelectorAll(".remove-cart-item").forEach(button=>button.addEventListener("click",()=>{
    saveCart(getCart().filter(item=>item!==button.dataset.product)); renderCart();
  }));
}
renderCart();

if (document.querySelector("#checkoutSummaryItems")) {
  const queryProduct = new URLSearchParams(location.search).get("product");
  if (queryProduct && products[queryProduct]) addToCart(queryProduct);
  const cart = getCart().filter(item => products[item]);
  const summary = document.querySelector("#checkoutSummaryItems");
  if (cart.length) {
    summary.innerHTML=cart.map(item=>{const p=products[item];return `<div class="checkout-summary-item"><div class="mini-image ${p.image}"${productImageStyle(p)}></div><div><h2>${p.name}</h2><p>${p.platform} · ${p.finish}</p><strong>${p.price}</strong></div></div>`}).join("");
    setText("#summaryPrice",`$${cart.reduce((sum,item)=>sum+priceNumber(products[item].price),0).toLocaleString()}`);
  } else {
    summary.innerHTML='<div class="checkout-empty"><p>No collections selected.</p><a class="text-link" href="collections.html">Browse collections &rarr;</a></div>';
  }
}

document.querySelector("#purchaseForm")?.addEventListener("submit", e => {
  e.preventDefault();
  if (!e.currentTarget.reportValidity()) return;
  e.currentTarget.style.display="none";
  const confirmation=document.querySelector("#confirmation");
  confirmation.classList.add("show");
  localStorage.removeItem("gdeRequestCart");
  updateCartCount();
  confirmation.focus();
  confirmation.scrollIntoView({behavior:"smooth",block:"center"});
});
async function startAuthorizeCheckout({button, status, cart, customer, resetText}) {
  if (!cart.length) {
    status.textContent = "Please add a collection to your cart before paying.";
    return;
  }
  button.disabled = true;
  button.classList.add("disabled");
  button.textContent = "Connecting to Authorize.net...";
  status.textContent = "Emailing checkout details and creating secure payment session...";
  try {
    const response = await fetch("/api/create-authorize-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cart, customer })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.token || !result.paymentUrl) throw new Error(result.error || "Unable to start Authorize.net checkout.");
    status.textContent = `Redirecting to Authorize.net for $${Number(result.amount).toLocaleString()}...`;
    const form = document.createElement("form");
    form.method = "post";
    form.action = result.paymentUrl;
    form.style.display = "none";
    const token = document.createElement("input");
    token.type = "hidden";
    token.name = "token";
    token.value = result.token;
    form.appendChild(token);
    document.body.appendChild(form);
    form.submit();
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
    button.classList.remove("disabled");
    button.innerHTML = resetText;
  }
}
if (document.querySelector("#proceedToPayment")) {
  const paymentLink = document.querySelector("#proceedToPayment");
  const status = document.querySelector("#checkoutPaymentStatus");
  paymentLink.addEventListener("click", event => {
    event.preventDefault();
    const form = document.querySelector("#purchaseForm");
    if (form && !form.reportValidity()) {
      status.textContent = "Please complete every checkout field and compliance confirmation before continuing.";
      return;
    }
    const cart = getCart().filter(item => products[item] && !products[item].availability.includes("Archive"));
    const customer = form ? Object.fromEntries(new FormData(form).entries()) : {};
    localStorage.setItem("gdeCheckoutDetails", JSON.stringify(customer));
    const resetText = 'Proceed to Checkout <span>&rarr;</span>';
    startAuthorizeCheckout({button: paymentLink, status, cart, customer, resetText});
  });
}
if (document.querySelector("#paymentSummaryItems")) {
  const paymentParams = new URLSearchParams(location.search).get("cart");
  const cart = (paymentParams ? paymentParams.split(",") : getCart()).filter(item => products[item]);
  const container = document.querySelector("#paymentSummaryItems");
  container.innerHTML = cart.length ? cart.map(item => {
    const p = products[item];
    return `<div class="checkout-summary-item"><div class="mini-image ${p.image}"${productImageStyle(p)}></div><div><h2>${p.name}</h2><p>${p.platform} · ${p.finish}</p><strong>${p.price}</strong></div></div>`;
  }).join("") : '<div class="checkout-empty"><p>No collection selected.</p><a class="text-link" href="collections.html">Browse collections &rarr;</a></div>';
  document.querySelector("#paymentTotal").textContent = `$${cart.reduce((sum,item)=>sum+priceNumber(products[item].price),0).toLocaleString()}`;
}
document.querySelector("#authorizePayButton")?.addEventListener("click", event => {
  const button = event.currentTarget;
  const status = document.querySelector("#paymentStatus");
  const paymentParams = new URLSearchParams(location.search).get("cart");
  const cart = (paymentParams ? paymentParams.split(",") : getCart()).filter(item => products[item] && !products[item].availability.includes("Archive"));
  let customer = {};
  try {
    customer = JSON.parse(localStorage.getItem("gdeCheckoutDetails")) || {};
  } catch {}
  startAuthorizeCheckout({button, status, cart, customer, resetText: "Pay Securely with Authorize.net"});
});
document.querySelector("#inquiryForm")?.addEventListener("submit", e => {
  e.preventDefault();
  if (!e.currentTarget.reportValidity()) return;
  e.currentTarget.querySelector(".form-message").textContent="Thank you. Our collection team will be in touch.";
  e.currentTarget.reset();
});
document.querySelector("#contactForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.currentTarget;
  if (!form.reportValidity()) return;
  const button = form.querySelector('button[type="submit"]');
  const message = form.querySelector(".form-message");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Sending...";
  message.textContent = "";
  try {
    const response = await fetch(form.action, {
      method: "POST",
      headers: { "Accept": "application/json" },
      body: new FormData(form)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || result.errors?.[0]?.message || "Formspree did not accept the message.");
    message.textContent = "Thank you. Your inquiry was submitted successfully.";
    form.reset();
  } catch (error) {
    message.innerHTML = `The form service did not confirm delivery. Please try again, or email us directly at <a href="mailto:gdecollectibles@gmail.com">gdecollectibles@gmail.com</a>.`;
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
});
