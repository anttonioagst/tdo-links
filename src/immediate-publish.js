import { hasRealPromotion } from "./deals.js";
import { relatedOfferRecentlyPublished, wasSimilarOfferPublished } from "./publication-dedupe.js";

export function selectImmediatePublishOffer(state = {}, config = {}) {
  const offers = state.offers || [];
  return offers.find((offer) => (
    offer.status === "auto_ready" &&
    hasRealPromotion(offer) &&
    !wasPublished(state, offer.id, "telegram") &&
    !wasSimilarOfferPublished(state, offer, "telegram") &&
    !relatedOfferRecentlyPublished(state, offer, "telegram", config.relatedOfferDedupeHours ?? 24)
  )) || null;
}

function wasPublished(state, offerId, channel) {
  return (state.publishLog || []).some((entry) => (
    entry.offerId === offerId &&
    entry.channel === channel &&
    entry.result?.ok === true
  ));
}
