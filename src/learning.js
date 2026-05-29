const KNOWN_BRANDS = [
  "redragon", "logitech", "havit", "hyperx", "anker", "soundcore", "tp-link",
  "samsung", "lg", "sony", "jbl", "kingston", "sandisk", "dell", "razer",
  "corsair", "steelseries", "crucial", "wd", "western digital", "aoc", "asus",
  "lenovo", "apple", "xiaomi", "philips", "benq", "gigabyte", "msi", "seagate"
];

export function buildLearningProfile(state = {}) {
  const offers = new Map((state.offers || []).map((offer) => [offer.id, offer]));
  const clicksByOffer = new Map();
  for (const click of state.clicks || []) {
    clicksByOffer.set(click.offerId, (clicksByOffer.get(click.offerId) || 0) + 1);
  }
  const profile = {
    totalPublished: 0,
    totalClicks: 0,
    brand: {},
    category: {},
    priceBucket: {},
    discountBucket: {}
  };
  const publishedOfferIds = new Set(
    (state.publishLog || [])
      .filter((entry) => entry.channel === "telegram" && entry.result?.ok && entry.offerId)
      .map((entry) => entry.offerId)
  );
  for (const offerId of publishedOfferIds) {
    const offer = offers.get(offerId);
    if (!offer) continue;
    const clicks = clicksByOffer.get(offerId) || 0;
    profile.totalPublished += 1;
    profile.totalClicks += clicks;
    addSignal(profile.brand, extractBrand(offer), clicks);
    addSignal(profile.category, offer.category || "unknown", clicks);
    addSignal(profile.priceBucket, priceBucket(offer.currentPrice), clicks);
    addSignal(profile.discountBucket, discountBucket(offer.discountPercent), clicks);
  }
  return profile;
}

export function learningScoreForOffer(offer, profile = {}) {
  if (!profile.totalPublished) return 0;
  return clamp(
    signalScore(profile.brand?.[extractBrand(offer)]) * 0.45 +
    signalScore(profile.category?.[offer.category || "unknown"]) * 0.2 +
    signalScore(profile.priceBucket?.[priceBucket(offer.currentPrice)]) * 0.15 +
    signalScore(profile.discountBucket?.[discountBucket(offer.discountPercent)]) * 0.2,
    -20,
    25
  );
}

export function extractBrand(offer = {}) {
  const title = String(offer.title || "").toLowerCase();
  return KNOWN_BRANDS.find((brand) => title.includes(brand)) || "unknown";
}

function addSignal(bucket, key, clicks) {
  if (!bucket[key]) bucket[key] = { published: 0, clicks: 0 };
  bucket[key].published += 1;
  bucket[key].clicks += clicks;
}

function signalScore(signal) {
  if (!signal?.published) return 0;
  const clickRate = signal.clicks / signal.published;
  if (clickRate >= 2) return 25;
  if (clickRate >= 1) return 15;
  if (clickRate > 0) return 8;
  return -8;
}

function priceBucket(value) {
  const price = Number(value || 0);
  if (price <= 50) return "0-50";
  if (price <= 100) return "50-100";
  if (price <= 250) return "100-250";
  if (price <= 500) return "250-500";
  return "500+";
}

function discountBucket(value) {
  const discount = Number(value || 0);
  if (discount >= 50) return "50+";
  if (discount >= 35) return "35-49";
  if (discount >= 20) return "20-34";
  if (discount >= 10) return "10-19";
  return "0-9";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}
