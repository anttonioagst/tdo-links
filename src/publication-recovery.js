import { hasRealPromotion } from "./deals.js";
import { telegramPublicationStatus } from "./publication-policy.js";
import { premiumCurationScore } from "./premium-curation.js";

export function selectPendingTelegramOffers(state = {}, limit = 4, options = {}) {
  const now = options.now || new Date();
  const lookbackHours = Number(options.lookbackHours ?? 8);
  const minScore = Number(options.minScore ?? 30);
  const cutoff = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
  const publishedOfferIds = new Set(
    (state.publishLog || [])
      .filter((entry) => entry.channel === "telegram" && entry.result?.ok && entry.offerId)
      .map((entry) => entry.offerId)
  );

  return (state.offers || [])
    .filter((offer) =>
      offer.status === "auto_ready" &&
      offer.id &&
      !publishedOfferIds.has(offer.id) &&
      hasRealPromotion(offer) &&
      hasProductImage(offer) &&
      new Date(offer.updatedAt || offer.createdAt || 0) >= cutoff &&
      premiumCurationScore(offer, options.config || {}, state) >= minScore
    )
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    .slice(0, limit);
}

export async function enqueuePendingTelegramOffers(db, config, queue) {
  if (!queue) return { enqueued: 0, skipped: true, reason: "queue_unavailable" };
  if (db.load) await db.load();

  const publication = telegramPublicationStatus(db.state.publishLog || [], config);
  if (!publication.allowed) {
    return { enqueued: 0, skipped: true, reason: publication.reason, waitMinutes: publication.waitMinutes };
  }

  const availableSlots = Math.max(1, Number(config.maxPublicationsPerCycle || 4) - publication.recentPublished);
  const offers = selectPendingTelegramOffers(db.state, availableSlots, {
    config,
    minScore: config.recoveryPremiumMinScore ?? config.premiumCurationMinScore ?? 30
  });
  let enqueued = 0;

  for (const offer of offers) {
    await queue.add("creative", {
      offer,
      validationResult: {
        valid: true,
        confidence: offer.validationConfidence || 100,
        reason: offer.validationSummary || "Oferta aprovada aguardando publicação."
      }
    }, {
      attempts: 3,
      backoff: { type: "exponential", delay: 30000 },
      jobId: `recover_${offer.id}`
    });
    enqueued++;
  }

  return { enqueued, skipped: false, reason: "ok" };
}

function hasProductImage(offer) {
  return Boolean(
    offer?.telegramImageFileId ||
    offer?.imageUrl ||
    offer?.imageUrls?.length ||
    offer?.officialImageUrls?.length
  );
}
