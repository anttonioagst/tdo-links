import { hasRealPromotion } from "./deals.js";
import { relatedOfferRecentlyPublished, wasSimilarOfferPublished } from "./publication-dedupe.js";

export function selectImmediatePublishOffer(state = {}, config = {}, options = {}) {
  const offers = options.offerId
    ? (state.offers || []).filter((offer) => offer.id === options.offerId)
    : [...(state.offers || [])].sort((a, b) => offerPriority(b) - offerPriority(a));
  return offers.find((offer) => (
    offer.status === "auto_ready" &&
    hasRealPromotion(offer) &&
    !wasPublished(state, offer.id, "telegram") &&
    !wasPublishedToAnyChannel(state, offer.id) &&
    !wasSimilarOfferPublished(state, offer, "telegram") &&
    !relatedOfferRecentlyPublished(state, offer, "telegram", config.relatedOfferDedupeHours ?? 24)
  )) || null;
}

function offerPriority(offer = {}) {
  const imageScore = hasImageCandidate(offer) ? 1000 : 0;
  const priceScore = Number(offer.currentPrice || 0) >= 100 ? 100 : 0;
  const discountScore = Number(offer.discountPercent || 0);
  return imageScore + priceScore + discountScore;
}

function hasImageCandidate(offer = {}) {
  return Boolean(offer.telegramImageFileId || offer.officialImageUrls?.length || offer.imageUrls?.length || offer.imageUrl);
}

function wasPublishedToAnyChannel(state, offerId) {
  return (state.publishLog || []).some((entry) => entry.offerId === offerId && entry.result?.ok === true);
}

function wasPublished(state, offerId, channel) {
  return (state.publishLog || []).some((entry) => (
    entry.offerId === offerId &&
    entry.channel === channel &&
    entry.result?.ok === true
  ));
}
