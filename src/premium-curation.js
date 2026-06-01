import { hasRealPromotion, promotionDiscountPercent } from "./deals.js";

const DEFAULT_PREMIUM_BRANDS = [
  "logitech", "hyperx", "razer", "sony", "jbl", "samsung", "lg", "dell",
  "kingston", "sandisk", "anker", "soundcore", "tp-link", "corsair",
  "steelseries", "crucial", "wd", "western digital", "aoc", "asus", "lenovo",
  "apple", "xiaomi", "philips", "benq", "gigabyte", "msi", "seagate",
  "acer", "tcl", "hisense", "husky", "elements", "flexform"
];

// Secondary brands removed — they are not premium enough for this channel.
// validateDeal now hard-rejects anything not in the premium list.
const DEFAULT_SECONDARY_BRANDS = [];

const CATEGORY_KEYWORDS = [
  ["tv", ["smart tv", "televisão", "televisao", "tv ", " tv", "oled", "qled", "crystal uhd"]],
  ["headset", ["headset", "fone", "earbud", "wh-1000", "soundcore", "jbl", "sony"]],
  ["ssd", ["ssd", "nvme", "m.2", "kingston", "sandisk", "crucial", "wd", "seagate"]],
  ["monitor", ["monitor", "display", "aoc", "lg ultragear", "benq"]],
  ["teclado", ["teclado", "keyboard"]],
  ["mouse", ["mouse", "mx master", "g502", "deathadder", "basilisk"]],
  ["notebook", ["notebook", "laptop", "macbook", "ideapad", "vivobook", "inspiron", "aspire"]],
  ["mesa", ["mesa", "desk", "standing desk", "escrivaninha", "bancada"]],
  ["roteador", ["roteador", "router", "mesh", "deco", "tp-link"]],
  ["audio", ["caixa de som", "speaker", "soundbar"]],
  ["smart_home", ["echo", "alexa", "smart", "camera"]]
];

const CATEGORY_POINTS = {
  headset: 12,
  ssd: 12,
  tv: 12,
  monitor: 11,
  notebook: 11,
  mesa: 8,
  roteador: 9,
  teclado: 7,
  audio: 9,
  smart_home: 7,
  mouse: 2,
  tech: 4,
  other: -8
};

export function premiumCurationScore(offer = {}, config = {}, state = {}) {
  if (!hasRealPromotion(offer)) return -100;

  const brand = extractPremiumBrand(offer, config);
  const category = normalizePremiumCategory(offer);
  const discount = promotionDiscountPercent(offer);
  const price = Number(offer.currentPrice || 0);
  let score = 0;

  if (brand.tier === "premium") score += 42;
  else if (brand.tier === "secondary") score += 18;
  else score -= 35;

  if (discount >= 45) score += 22;
  else if (discount >= 30) score += 18;
  else if (discount >= 20) score += 12;
  else if (discount >= 10) score += 5;

  if (price >= 500) score += 12;
  else if (price >= 180) score += 9;
  else if (price >= 90) score += 4;
  else score -= 6;

  if (offer.rating >= 4.7) score += 10;
  else if (offer.rating >= 4.4) score += 7;
  else if (offer.rating >= 4.0) score += 3;
  else if (offer.rating && offer.rating < 4.0) score -= 12;

  if (offer.reviewCount >= 1000) score += 8;
  else if (offer.reviewCount >= 300) score += 5;
  else if (offer.reviewCount >= 50) score += 2;

  score += CATEGORY_POINTS[category] ?? CATEGORY_POINTS.tech;

  if (recentCategoryCount(state, category) > 0) score -= category === "mouse" ? 18 : 10;
  if (recentBrandCount(state, brand.name) > 0) score -= 8;

  return Math.round(score);
}

export function selectPremiumCandidates(offers = [], limit = 4, state = {}, config = {}) {
  const maxPerCategory = Number(config.maxPremiumCategoryPerWindow || 1);
  const minScore = Number(config.premiumCurationMinScore || 30);
  const sorted = offers
    .map((offer) => ({
      offer,
      score: premiumCurationScore(offer, config, state),
      category: normalizePremiumCategory(offer),
      brand: extractPremiumBrand(offer, config).name
    }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score);

  const selected = [];
  const categoryCounts = new Map();
  const brandCounts = new Map();

  for (const item of sorted) {
    if (selected.length >= limit) break;
    const categoryCount = categoryCounts.get(item.category) || 0;
    const brandCount = brandCounts.get(item.brand) || 0;
    if (categoryCount >= maxPerCategory) continue;
    if (item.brand !== "unknown" && brandCount >= 1) continue;
    selected.push(item.offer);
    categoryCounts.set(item.category, categoryCount + 1);
    brandCounts.set(item.brand, brandCount + 1);
  }

  return selected;
}

export function extractPremiumBrand(offer = {}, config = {}) {
  const title = String(offer.title || "").toLowerCase();
  const premiumBrands = parseBrandList(config.premiumBrands, DEFAULT_PREMIUM_BRANDS);
  const secondaryBrands = parseBrandList(config.secondaryBrands, DEFAULT_SECONDARY_BRANDS);
  const premium = premiumBrands.find((brand) => title.includes(brand));
  if (premium) return { name: premium, tier: "premium" };
  const secondary = secondaryBrands.find((brand) => title.includes(brand));
  if (secondary) return { name: secondary, tier: "secondary" };
  return { name: "unknown", tier: "unknown" };
}

export function normalizePremiumCategory(offer = {}) {
  const text = `${offer.title || ""} ${offer.category || ""}`.toLowerCase();
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((keyword) => text.includes(keyword))) return category;
  }
  return offer.category && offer.category !== "tech" ? offer.category : "tech";
}

function parseBrandList(value, fallback) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
  return String(value).split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function recentCategoryCount(state = {}, category) {
  const offers = new Map((state.offers || []).map((offer) => [offer.id, offer]));
  return (state.publishLog || [])
    .filter((entry) => entry.channel === "telegram" && entry.result?.ok && entry.offerId)
    .slice(0, 4)
    .filter((entry) => normalizePremiumCategory(offers.get(entry.offerId) || {}) === category)
    .length;
}

function recentBrandCount(state = {}, brand) {
  if (!brand || brand === "unknown") return 0;
  const offers = new Map((state.offers || []).map((offer) => [offer.id, offer]));
  return (state.publishLog || [])
    .filter((entry) => entry.channel === "telegram" && entry.result?.ok && entry.offerId)
    .slice(0, 4)
    .filter((entry) => extractPremiumBrand(offers.get(entry.offerId) || {}).name === brand)
    .length;
}
