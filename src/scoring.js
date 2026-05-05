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
  if (offer.currentPrice <= 150) score += 3;
  if (offer.previousPrice && offer.currentPrice > offer.previousPrice) score -= 30;

  return Math.max(0, Math.min(100, Math.round(score)));
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
