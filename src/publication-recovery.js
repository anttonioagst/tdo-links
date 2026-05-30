import { hasRealPromotion } from "./deals.js";
import { telegramPublicationStatus } from "./publication-policy.js";
import { premiumCurationScore } from "./premium-curation.js";

export function selectPendingTelegramOffers(state = {}, limit = 4, options = {}) {
  const now = options.now || new Date();
  const lookbackHours = Number(options.lookbackHours ?? 12);
  const failedLookbackHours = Number(options.failedLookbackHours ?? 2);
  const minScore = Number(options.minScore ?? 30);
  const cutoff = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
  const failedCutoff = new Date(now.getTime() - failedLookbackHours * 60 * 60 * 1000);
  const publishedOfferIds = new Set(
    (state.publishLog || [])
      .filter((entry) => entry.channel === "telegram" && entry.result?.ok && entry.offerId)
      .map((entry) => entry.offerId)
  );
  const recentlyFailedOfferIds = new Set(
    (state.publishLog || [])
      .filter((entry) =>
        entry.channel === "telegram" &&
        entry.result?.ok === false &&
        entry.offerId &&
        new Date(entry.createdAt) >= failedCutoff
      )
      .map((entry) => entry.offerId)
  );

  return (state.offers || [])
    .map((offer) => ({
      offer,
      score: premiumCurationScore(offer, options.config || {}, state)
    }))
    .filter(({ offer, score }) =>
      offer.status === "auto_ready" &&
      offer.id &&
      !publishedOfferIds.has(offer.id) &&
      !recentlyFailedOfferIds.has(offer.id) &&
      hasRealPromotion(offer) &&
      hasProductImage(offer) &&
      new Date(offer.createdAt || offer.updatedAt || 0) >= cutoff &&
      score >= minScore
    )
    .sort((a, b) =>
      b.score - a.score ||
      new Date(b.offer.createdAt || b.offer.updatedAt || 0) - new Date(a.offer.createdAt || a.offer.updatedAt || 0)
    )
    .map(({ offer }) => offer)
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
    lookbackHours: config.recoveryLookbackHours ?? 12,
    failedLookbackHours: config.recoveryFailedLookbackHours ?? 2,
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
      jobId: `recover_${offer.id}_${Date.now()}`
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
