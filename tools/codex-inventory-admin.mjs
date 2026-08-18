#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inventoryPath = path.join(root, "codex-inventory.json");
const scriptPath = path.join(root, "script.js");
const collectionsPath = path.join(root, "collections.html");
const listingsPath = path.join(root, "assets", "listings");
const photoExtensions = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"]);

const read = file => fs.readFileSync(file, "utf8");
const write = (file, text) => fs.writeFileSync(file, text);
const inventory = () => JSON.parse(read(inventoryPath));
const saveInventory = data => write(inventoryPath, `${JSON.stringify(data, null, 2)}\n`);
const priceNumber = value => Number(String(value).replace(/[$,]/g, ""));
const money = value => {
  const number = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(number) ? `$${number.toLocaleString()}` : value;
};
const slug = value => String(value).trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const platformSlug = value => value === ".38 Special" ? "38-special" : value === ".45 ACP" ? "45-acp" : slug(value);
const availabilitySlug = value => value.includes("Archive") || value.includes("Sold") ? "archive" : value.includes("Limited") ? "limited" : "available";
const escapeHtml = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const jsProducts = products => Object.fromEntries(Object.entries(products).map(([id, p]) => [id, p]));
const labelsFor = (products, getter) => [...new Map(Object.values(products).map(getter).filter(Boolean).map(value => [value, value])).values()];
const checkboxGroup = (title, name, values, valueGetter = slug) => `<div class="filter-group"><h3>${title}</h3>\n          ${values.length ? values.map(value => `<label><input type="checkbox" name="${name}" value="${valueGetter(value)}"> ${escapeHtml(value)}</label>`).join("") : `<p class="filter-empty">No active listings</p>`}\n        </div>`;

function listingPhotos(id) {
  const folder = path.join(listingsPath, id);
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder)
    .filter(file => photoExtensions.has(path.extname(file).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .map(file => `assets/listings/${id}/${file.replaceAll("\\", "/")}`);
}

function syncPhotos(products) {
  for (const [id, product] of Object.entries(products)) {
    const photos = listingPhotos(id);
    if (photos.length) product.photos = photos;
    else delete product.photos;
  }
}

const productCard = ([id, p]) => {
  const availability = availabilitySlug(p.availability);
  const archived = availability === "archive";
  const photo = Array.isArray(p.photos) && p.photos[0] ? p.photos[0] : "";
  const imageStyle = photo ? ` style="background-image:url('${escapeHtml(photo)}')"` : "";
  return `<article class="product-card" data-type="${slug(p.type)}" data-product="${id}" data-collection="${slug(p.collection)}" data-platform="${platformSlug(p.platform)}" data-finish="${slug(p.finish)}" data-price="${priceNumber(p.price)}" data-availability="${availability}"><a class="product-image ${p.image}" href="product.html?product=${id}"${imageStyle}><span class="status ${availability}">${escapeHtml(p.availability)}</span></a><div class="product-info"><p class="meta">${escapeHtml(p.collection)}${p.collectionNumber ? ` &middot; ${escapeHtml(p.collectionNumber)}` : ""}</p><h2>${escapeHtml(p.name)}</h2><p class="price">${escapeHtml(p.price)}</p><div class="card-actions">${archived ? `<a class="button full disabled" aria-disabled="true">Contact Us</a>` : `<a class="button full add-to-cart-link" href="checkout.html?product=${id}" data-product="${id}">ADD TO CART</a>`}<a class="text-link" href="product.html?product=${id}">View Details &rarr;</a></div></div></article>`;
};

function generate() {
  const data = inventory();
  const products = data.products;
  syncPhotos(products);
  saveInventory(data);
  const entries = Object.entries(products);

  let script = read(scriptPath);
  script = script.replace(/^const products = [\s\S]*?;\r?\nconst priceNumber/m, `const products = ${JSON.stringify(jsProducts(products), null, 2)};\nconst priceNumber`);
  const collectionNavLinks = labelsFor(products, p => p.collection)
    .map(collection => `        <a href="collections.html?collection=${slug(collection)}">${escapeHtml(collection)}</a>`)
    .join("\n");
  const platformNavLinks = labelsFor(products, p => p.platform)
    .map(platform => `        <a href="collections.html?platform=${platformSlug(platform)}">${escapeHtml(platform)}</a>`)
    .join("\n");
  const navLinks = entries
    .filter(([, p]) => availabilitySlug(p.availability) !== "archive")
    .map(([id, p]) => `        <a href="collections.html?item=${id}">${escapeHtml(p.name)}</a>`)
    .join("\n");
  const dropdownContent = `        <a href="collections.html">All Collections</a>\n        <p>Collection</p>\n${collectionNavLinks || `        <a href="collections.html">No active collections</a>`}\n        <p>Platform</p>\n${platformNavLinks || `        <a href="collections.html">No active platforms</a>`}\n        <p>Individual listings</p>\n${navLinks || `        <a href="collections.html">No active listings</a>`}`;
  script = script.replace(/        <a href="collections\.html">All Collections<\/a>\r?\n[\s\S]*?      <\/div>`;/, `${dropdownContent}\n      </div>\`;`);
  write(scriptPath, script);

  const prices = Object.values(products).map(p => priceNumber(p.price)).filter(Number.isFinite);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const collectionFilters = checkboxGroup("Collection", "collection", labelsFor(products, p => p.collection));
  const productFilters = checkboxGroup("Listing", "product", entries.map(([, p]) => p.name), value => entries.find(([, p]) => p.name === value)?.[0] || slug(value));
  const typeFilters = checkboxGroup("Collection type", "type", labelsFor(products, p => p.type));
  const platformFilters = checkboxGroup("Firearm platform", "platform", labelsFor(products, p => p.platform), platformSlug);
  const finishFilters = checkboxGroup("Finish", "finish", labelsFor(products, p => p.finish));
  const availabilityFilters = checkboxGroup("Availability", "availability", labelsFor(products, p => p.availability), availabilitySlug);
  const filters = `${collectionFilters}\n        ${productFilters}\n        ${typeFilters}\n        ${platformFilters}\n        ${finishFilters}\n        <div class="filter-group"><div class="range-heading"><h3>Maximum price</h3><strong id="priceValue">$${maxPrice.toLocaleString()}</strong></div><input id="priceRange" type="range" min="${minPrice}" max="${maxPrice}" step="100" value="${maxPrice}"><div class="range-limits"><span>$${minPrice.toLocaleString()}</span><span>$${maxPrice.toLocaleString()}</span></div></div>\n        ${availabilityFilters}`;
  let collections = read(collectionsPath);
  collections = collections.replace(/        <div class="filter-group"><h3>Collection<\/h3>[\s\S]*?        <button class="button secondary full reset-filters"|        <div class="filter-group"><h3>Collections<\/h3>[\s\S]*?        <button class="button secondary full reset-filters"/, `        ${filters}\n        <button class="button secondary full reset-filters"`);
  collections = collections.replace(/<p id="resultsLabel">Showing all \d+ (?:collections|listings)<\/p>/, `<p id="resultsLabel">Showing all ${entries.length} listings</p>`);
  const gridContent = entries.map(productCard).join("\n          ");
  const noResultsClass = entries.length ? "no-results" : "no-results show";
  const noResultsTitle = entries.length ? "No collections match" : "No active listings";
  const noResultsCopy = entries.length ? "Try adjusting or resetting your filters." : "All listings have been cleared while GDE prepares the next release.";
  collections = collections.replace(/        <div class="product-grid" id="productGrid">[\s\S]*?        <\/div>\r?\n        <div class="no-results(?: show)?" id="noResults">[\s\S]*?<\/div>/, `        <div class="product-grid" id="productGrid">\n          ${gridContent}\n        </div>\n        <div class="${noResultsClass}" id="noResults"><h2>${noResultsTitle}</h2><p>${noResultsCopy}</p>${entries.length ? "" : `<a class="button secondary" href="contact.html">Contact Us</a>`}</div>`);
  write(collectionsPath, collections);
  console.log(`Generated ${entries.length} listings into script.js and collections.html.`);
}

function parsePairs(args) {
  return Object.fromEntries(args.map(arg => {
    const index = arg.indexOf("=");
    if (index < 1) throw new Error(`Expected key=value, got ${arg}`);
    return [arg.slice(0, index), arg.slice(index + 1)];
  }));
}

function list() {
  const { products } = inventory();
  for (const [id, p] of Object.entries(products)) console.log(`${id} | ${p.name} | ${p.platform} | ${p.finish} | ${p.price} | ${p.availability}`);
}

function filters() {
  const { products } = inventory();
  console.log("Collection types:", labelsFor(products, p => p.type).join(", ") || "none");
  console.log("Platforms:", labelsFor(products, p => p.platform).join(", ") || "none");
  console.log("Finishes:", labelsFor(products, p => p.finish).join(", ") || "none");
  console.log("Availability:", labelsFor(products, p => p.availability).join(", ") || "none");
}

function add(args) {
  const data = inventory();
  const item = parsePairs(args);
  const id = item.id;
  if (!id) throw new Error("Missing id=your-slug");
  if (data.products[id]) throw new Error(`Listing already exists: ${id}`);
  const required = ["name", "collection", "type", "platform", "finish", "price", "availability", "image", "description"];
  const missing = required.filter(key => !item[key]);
  if (missing.length) throw new Error(`Missing fields: ${missing.join(", ")}`);
  item.price = money(item.price);
  delete item.id;
  data.products[id] = item;
  saveInventory(data);
  generate();
}

function update(id, args) {
  const data = inventory();
  if (!data.products[id]) throw new Error(`Listing not found: ${id}`);
  const updates = parsePairs(args);
  if (updates.price) updates.price = money(updates.price);
  Object.assign(data.products[id], updates);
  saveInventory(data);
  generate();
}

function archive(id) {
  update(id, ["availability=Sold / Archive"]);
}

function remove(id) {
  const data = inventory();
  if (!data.products[id]) throw new Error(`Listing not found: ${id}`);
  delete data.products[id];
  saveInventory(data);
  generate();
}

function clear() {
  saveInventory({ products: {} });
  generate();
}

const [command, first, ...rest] = process.argv.slice(2);
try {
  if (!command || command === "help") {
    console.log(`Codex-only inventory controls:
  list
  filters
  generate
  add id=slug name="Name" collection="Collection" type="Type" platform=".45 ACP" finish="Gold" price=5000 availability="Available" image="image-presidential" description="..."
  update slug price=5200 availability="Limited Availability"
  archive slug
  remove slug
  clear`);
  } else if (command === "list") list();
  else if (command === "filters") filters();
  else if (command === "generate") generate();
  else if (command === "add") add([first, ...rest].filter(Boolean));
  else if (command === "update") update(first, rest);
  else if (command === "archive") archive(first);
  else if (command === "remove") remove(first);
  else if (command === "clear") clear();
  else throw new Error(`Unknown command: ${command}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
