// Collector clubs (user, Nov 12, 2026), store-wide, on every purchase once reached:
//   3+ guns bought: Collectors Club, 5% off
//   5+ guns bought: Legacy Club, 10% off, plus a personal 5% friends and family code (not built yet)
// What counts: each gun in a paid website order (status "paid", which the inventory app sets once Authorize.net shows
// the payment) placed with the account's email at checkout, or while signed in to that account; plus guns bought
// outside the website that GDE checked and credited to the account (see _credits.js); plus guns friends bought through
// the account's share link (order.referredBy, see _referral.js). Refunded, cancelled, declined
// and unpaid orders don't count. Test (sandbox) orders only count while the site itself takes test payments.
// A tier's discount starts on the next order after the gun that reaches it; it is worked out here, on the server, at
// payment time.
const store = require("./_store");
const { getCredit } = require("./_credits");

const TIERS = [ // highest first
  { id: "legacy", name: "Legacy Club", guns: 5, percent: 10 },
  { id: "collector", name: "Collectors Club", guns: 3, percent: 5 }
];

const norm = (email) => String(email || "").trim().toLowerCase();
const environment = () => (process.env.AUTHORIZE_ENV === "production" ? "production" : "sandbox");

function statusFor(website, credited = 0, referred = 0) {
  const guns = website + credited + referred;
  const tier = TIERS.find((t) => guns >= t.guns) || null;
  const next = [...TIERS].reverse().find((t) => guns < t.guns) || null;
  return {
    guns,
    website,                                 // bought on the site
    credited,                                // bought elsewhere, checked and added by GDE
    referred,                                // bought by friends through the share link
    collector: !!tier,                       // any tier: gets a discount
    tier: tier?.id || null,
    tierName: tier?.name || null,
    percent: tier?.percent || 0,
    next: next ? { id: next.id, name: next.name, guns: next.guns, percent: next.percent, toGo: next.guns - guns } : null
  };
}

async function collectorStatus(email, orders) {
  email = norm(email);
  let website = 0, credited = 0, referred = 0;
  if (email && store.configured()) {
    const env = environment();
    for (const o of orders || (await store.listOrders())) {
      if (o.status !== "paid" || (o.environment || "sandbox") !== env) continue;
      if (norm(o.form?.email) === email || norm(o.account) === email) website += (o.items || []).length;
      else if (norm(o.referredBy) === email) referred += (o.items || []).length;
    }
    credited = Number((await getCredit(email))?.guns) || 0;
  }
  return statusFor(website, credited, referred);
}

// A price after a tier's discount, to the cent (the checkout page rounds the same way).
const discounted = (price, percent) => Math.round(price * (100 - percent)) / 100;

module.exports = { TIERS, statusFor, collectorStatus, discounted };
