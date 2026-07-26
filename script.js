const products = {
  presidential:{name:"Presidential Collection 1911",collection:"Presidential Collection",platform:".45 ACP",finish:"Gold",price:"$5,000",availability:"Limited Availability",image:"image-presidential",description:"A collector-grade edition pairing stately American motifs with deeply cut scrollwork and considered gold accents. Created in a tightly limited series for the discerning private collection."},
  heritage:{name:"Heritage Engraved 1911",collection:"Heritage 1911 Collection",platform:".45 ACP",finish:"Blued Steel",price:"$3,500",availability:"Available",image:"image-heritage",description:"Classic 1911 proportions meet traditional scroll engraving and a rich blued-steel finish in this enduring American heritage edition."},
  "gold-inlay":{name:"Gold Inlay Commander",collection:"Gold Inlay Collection",platform:".45 ACP",finish:"Two-Tone",price:"$4,800",availability:"Limited Availability",image:"image-gold",description:"A refined Commander distinguished by bright gold inlay, dimensional scrollwork, and a restrained two-tone presentation finish."},
  wildlife:{name:"Wildlife Engraved Revolver",collection:"Wildlife Engraving Collection",platform:".38 Special",finish:"Nickel",price:"$4,200",availability:"Available",image:"image-wildlife",description:"A polished revolver featuring a sculpted wildlife scene, fine ornamental borders, and luminous nickel presentation surfaces."},
  legacy:{name:"Legacy Series Rifle",collection:"Legacy Collection",platform:".45 ACP",finish:"Blued Steel",price:"$4,900",availability:"Limited Availability",image:"image-rifle",description:"A sporting rifle edition grounded in old-world gunmaking traditions, with engraved steel and warm presentation-grade furniture."},
  silver:{name:"Silver Scroll 1911",collection:"Heritage Collection",platform:".45 ACP",finish:"Silver",price:"$3,200",availability:"Available",image:"image-silver",description:"Bright silver surfaces and disciplined scrollwork give this 1911 a clean, architectural character."},
  executive:{name:"Executive Gold Collection",collection:"Presidential Collection",platform:".45 ACP",finish:"Gold",price:"$5,000",availability:"Limited Availability",image:"image-executive",description:"A formal gold-finished edition with deep contrast engraving, made for a commanding presentation."},
  archive:{name:"Collector Archive Piece",collection:"Legacy Collection",platform:".38 Special",finish:"Silver",price:"$3,000",availability:"Sold / Archive",image:"image-archive",description:"A documented archive edition retained as a reference to earlier GDE craftsmanship and collector provenance."}
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
    collectionMenu.innerHTML = `<button class="nav-dropdown-toggle" type="button" aria-expanded="false">Collections <span>⌄</span></button>
      <div class="nav-dropdown-panel">
        <a href="collections.html">All Collections</a>
        <p>Platform</p>
        <a href="collections.html?platform=45-acp">.45 ACP</a>
        <a href="collections.html?platform=38-special">.38 Special</a>
        <p>Individual collections</p>
        <a href="collections.html?item=presidential">Presidential Collection</a>
        <a href="collections.html?item=heritage">Heritage Engraved 1911</a>
        <a href="collections.html?item=gold-inlay">Gold Inlay Commander</a>
        <a href="collections.html?item=wildlife">Wildlife Engraved Revolver</a>
        <a href="collections.html?item=legacy">Legacy Series Rifle</a>
        <a href="collections.html?item=silver">Silver Scroll 1911</a>
        <a href="collections.html?item=executive">Executive Gold Collection</a>
      </div>`;
    collectionsLink.replaceWith(collectionMenu);
  }
  if (!nav.querySelector(".marketplaces-menu")) {
    const marketplaceMenu = document.createElement("div");
    marketplaceMenu.className = "nav-dropdown marketplaces-menu";
    marketplaceMenu.innerHTML = `<button class="nav-dropdown-toggle" type="button" aria-expanded="false">Marketplaces <span>⌄</span></button>
      <div class="nav-dropdown-panel external-panel">
        <a href="https://www.gunbroker.com/" target="_blank" rel="noopener noreferrer">GUNBROKER <span>↗</span></a>
        <a href="https://www.gunsinternational.com/" target="_blank" rel="noopener noreferrer">GUNS INTERNATIONAL <span>↗</span></a>
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
    priceRange.value = 5000;
    if (requestedItem || requestedPlatform || requestedType) history.replaceState({}, "", "collections.html");
    location.reload();
  });
  document.querySelector(".mobile-filter-button")?.addEventListener("click", () => document.querySelector(".filters").classList.add("open"));
  document.querySelector(".filter-close")?.addEventListener("click", () => document.querySelector(".filters").classList.remove("open"));
  applyFilters();
}

const key = new URLSearchParams(location.search).get("product") || "presidential";
const product = products[key] || products.presidential;
function setText(selector, text){ const el=document.querySelector(selector); if(el) el.textContent=text; }
function setImage(selector){ const el=document.querySelector(selector); if(el){ Object.values(products).forEach(p=>el.classList.remove(p.image)); el.classList.add(product.image); } }
if (document.querySelector(".product-detail-page")) {
  document.title = `${product.name} | GDE Collectibles`;
  setText("#detailCollection",product.collection); setText("#detailName",product.name); setText("#detailPrice",product.price); setText("#detailPlatform",product.platform); setText("#detailFinish",product.finish); setText("#detailAvailability",product.availability); setText("#detailDescription",product.description); setImage("#detailImage");
  const request=document.querySelector("#detailRequest"); request.dataset.product=key;
  if(product.availability.includes("Archive")){request.textContent="Archive — Unavailable";request.disabled=true;}
}

document.querySelectorAll('a[href^="checkout.html?product="]').forEach(link => {
  const itemKey = new URL(link.href).searchParams.get("product");
  link.textContent = "ADD TO CART";
  link.addEventListener("click", event => {
    event.preventDefault();
    addToCart(itemKey);
    link.textContent = "Added — View Cart";
    link.href = "cart.html";
    link.addEventListener("click", () => location.href="cart.html", {once:true});
  });
});
document.querySelectorAll(".add-to-cart").forEach(button => button.addEventListener("click", () => {
  if (!addToCart(button.dataset.product)) return;
  button.textContent = "Added — View Cart";
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
    return `<article class="cart-item"><div class="cart-item-image ${p.image}"></div><div class="cart-item-copy"><p class="meta">${p.collection}</p><h2>${p.name}</h2><p>${p.platform} · ${p.finish} · ${p.availability}</p><span>FFL Transfer Required</span></div><div class="cart-item-price"><strong>${p.price}</strong><button type="button" class="remove-cart-item" data-product="${item}">Remove</button></div></article>`;
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
    summary.innerHTML=cart.map(item=>{const p=products[item];return `<div class="checkout-summary-item"><div class="mini-image ${p.image}"></div><div><h2>${p.name}</h2><p>${p.platform} · ${p.finish}</p><strong>${p.price}</strong></div></div>`}).join("");
    setText("#summaryPrice",`$${cart.reduce((sum,item)=>sum+priceNumber(products[item].price),0).toLocaleString()}`);
  } else {
    summary.innerHTML='<div class="checkout-empty"><p>No collections selected.</p><a class="text-link" href="collections.html">Browse collections →</a></div>';
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
if (document.querySelector("#proceedToPayment")) {
  const cart = getCart().filter(item => products[item]);
  const query = cart.length ? `?cart=${cart.join(",")}` : "";
  document.querySelector("#proceedToPayment").href = `payment.html${query}`;
}
if (document.querySelector("#paymentSummaryItems")) {
  const paymentParams = new URLSearchParams(location.search).get("cart");
  const cart = (paymentParams ? paymentParams.split(",") : getCart()).filter(item => products[item]);
  const container = document.querySelector("#paymentSummaryItems");
  container.innerHTML = cart.length ? cart.map(item => {
    const p = products[item];
    return `<div class="checkout-summary-item"><div class="mini-image ${p.image}"></div><div><h2>${p.name}</h2><p>${p.platform} · ${p.finish}</p><strong>${p.price}</strong></div></div>`;
  }).join("") : '<div class="checkout-empty"><p>No collection selected.</p><a class="text-link" href="collections.html">Browse collections →</a></div>';
  document.querySelector("#paymentTotal").textContent = `$${cart.reduce((sum,item)=>sum+priceNumber(products[item].price),0).toLocaleString()}`;
}
document.querySelector("#inquiryForm")?.addEventListener("submit", e => {
  e.preventDefault();
  if (!e.currentTarget.reportValidity()) return;
  e.currentTarget.querySelector(".form-message").textContent="Thank you. Our collection team will be in touch.";
  e.currentTarget.reset();
});
document.querySelector("#contactForm")?.addEventListener("submit", e => {
  e.preventDefault();
  if (!e.currentTarget.reportValidity()) return;
  e.currentTarget.querySelector(".form-message").textContent="Thank you. Our collection team will contact you shortly.";
  e.currentTarget.reset();
});
