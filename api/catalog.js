// Live prices and stock for the listing pages, as the GDE inventory app last sent them.
// Public: only listing names, prices and sold-out flags, never serials or counts. Empty when the store isn't set up,
// and the pages then keep the prices built into them.
const { getCatalog } = require("./_store");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") return response.status(405).json({ error: "Use GET." });
  try {
    const catalog = await getCatalog();
    const listings = {};
    for (const [key, l] of Object.entries(catalog?.listings || {})) {
      listings[key] = { price: Number.isFinite(l.price) ? l.price : null, soldOut: !!l.soldOut };
    }
    response.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
    return response.status(200).json({ updated: catalog?.updated || null, listings });
  } catch (error) {
    console.error(error);
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json({ updated: null, listings: {} });
  }
};
