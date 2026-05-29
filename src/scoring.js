import { premiumCurationScore } from "./premium-curation.js";

export function scoreOffer(offer) {
  let score = 30;

  if (offer.discountPercent >= 45) score += 30;
  else if (offer.discountPercent >= 30) score += 24;
  else if (offer.discountPercent >= 20) score += 16;
  else if (offer.discountPercent >= 10) score += 8;

  if (offer.rating >= 4.7) score += 12;
  else if (offer.rating >= 4.4) score += 9;
  else if (offer.rating >= 4.0) score += 5;
  else if (offer.rating && offer.rating < 3.8) score -= 15;

  if (offer.reviewCount >= 1000) score += 10;
  else if (offer.reviewCount >= 300) score += 7;
  else if (offer.reviewCount >= 50) score += 4;

  if (offer.inStock) score += 8;
  else score -= 25;

  if (offer.storeReputation === "high") score += 8;
  if (offer.category === "tech") score += 5;
  score += Math.max(-12, Math.min(18, Math.round(premiumCurationScore(offer) / 6)));
  if (offer.previousPrice && offer.currentPrice > offer.previousPrice) score -= 30;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreOfferDetailed(offer, performance = {}) {
  const reliability = clampScore(
    (offer.affiliateReady ? 35 : 0) +
    (offer.validationStatus === "ready" ? 35 : offer.validationStatus === "needs_review" ? 18 : 0) +
    (offer.inStock ? 20 : 0) +
    Math.round((offer.sourceConfidence ?? 0.5) * 10)
  );

  const attractiveness = clampScore(
    discountPoints(offer.discountPercent) +
    ratingPoints(offer.rating) +
    reviewPoints(offer.reviewCount) +
    premiumSignalPoints(offer)
  );

  const potential = clampScore(
    (offer.category === "tech" ? 70 : 45) +
    (offer.currentPrice >= 100 ? 15 : 8) +
    (offer.store === "amazon" ? 15 : 10)
  );

  const performanceScore = clampScore(Math.min(Number(performance.clicks || 0) * 10, 100));

  const total = Math.round(
    reliability * 0.45 +
    attractiveness * 0.32 +
    potential * 0.2 +
    performanceScore * 0.03
  );

  return {
    total: Math.max(0, Math.min(100, total)),
    components: {
      reliability,
      attractiveness,
      potential,
      performance: performanceScore
    }
  };
}

function premiumSignalPoints(offer) {
  const signal = premiumCurationScore(offer);
  if (signal >= 80) return 14;
  if (signal >= 60) return 10;
  if (signal >= 30) return 6;
  if (signal >= 0) return 2;
  return -8;
}

function discountPoints(discountPercent = 0) {
  if (discountPercent >= 45) return 42;
  if (discountPercent >= 30) return 35;
  if (discountPercent >= 20) return 30;
  if (discountPercent >= 10) return 15;
  return 5;
}

function ratingPoints(rating = 0) {
  if (rating >= 4.7) return 20;
  if (rating >= 4.4) return 15;
  if (rating >= 4.0) return 9;
  if (rating > 0) return 2;
  return 5;
}

function reviewPoints(reviewCount = 0) {
  if (reviewCount >= 1000) return 18;
  if (reviewCount >= 300) return 15;
  if (reviewCount >= 50) return 7;
  return 2;
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function statusForScore(score, settings) {
  if (score >= settings.autoPublishThreshold) return "auto_ready";
  if (score >= settings.reviewThreshold) return "needs_review";
  return "archived";
}

export function dedupeOffers(existingOffers, incomingOffers) {
  const seen = new Set(existingOffers.map((offer) => normalizeKey(offer)));
  return incomingOffers.filter((offer) => {
    const key = normalizeKey(offer);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeKey(offer) {
  const urlKey = new URL(offer.originalUrl).origin + new URL(offer.originalUrl).pathname.replace(/\/+$/, "");
  return `${offer.store}:${urlKey}`;
}
