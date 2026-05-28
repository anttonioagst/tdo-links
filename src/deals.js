export function hasRealPromotion(offer) {
  const current = Number(offer?.currentPrice || 0);
  const previous = Number(offer?.previousPrice || 0);
  return current > 0 && previous > current;
}

export function promotionDiscountPercent(offer) {
  if (!hasRealPromotion(offer)) return 0;
  const configured = Number(offer.discountPercent || 0);
  if (configured > 0) return Math.round(configured);
  const current = Number(offer.currentPrice);
  const previous = Number(offer.previousPrice);
  return Math.round(((previous - current) / previous) * 100);
}
