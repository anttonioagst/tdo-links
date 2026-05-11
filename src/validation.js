import { hasAffiliateConfig } from "./links.js";

const MAX_PRICE_AGE_HOURS = 24;

export function validateOffer(offer, config, now = new Date()) {
  const reasons = [];
  const warnings = [];
  const scrapedAt = offer.scrapedAt ? new Date(offer.scrapedAt) : null;
  const priceAgeHours = scrapedAt && !Number.isNaN(scrapedAt.getTime())
    ? (now.getTime() - scrapedAt.getTime()) / 3_600_000
    : Infinity;

  const affiliateReady = Boolean(offer.affiliateReady || hasAffiliateConfig(offer, config));
  if (!affiliateReady) reasons.push("affiliate_not_ready");
  if (!offer.currentPrice || Number(offer.currentPrice) <= 0) reasons.push("missing_price");
  if (priceAgeHours > MAX_PRICE_AGE_HOURS) warnings.push("price_stale");
  if (offer.inStock === false) reasons.push("out_of_stock");
  if (offer.store === "amazon" && offer.affiliateSource !== "manual" && !hasAffiliateConfig(offer, config)) {
    reasons.push("amazon_manual_link_required");
  }
  if (!affiliateReady && !offer.imageUrl && !(offer.imageUrls || []).length) warnings.push("missing_image");
  if (offer.source === "mock") warnings.push("mock_source");

  const blocked = reasons.length > 0;
  const needsReview = !blocked && warnings.length > 0;
  const validationStatus = blocked ? "blocked" : needsReview ? "needs_review" : "ready";
  return {
    validationStatus,
    validationReasons: [...reasons, ...warnings],
    validationSummary: summaryFor(validationStatus, reasons, warnings),
    priceValidatedAt: offer.currentPrice ? now.toISOString() : offer.priceValidatedAt || null,
    affiliateValidatedAt: affiliateReady ? now.toISOString() : offer.affiliateValidatedAt || null,
    publishable: validationStatus === "ready",
    affiliateReady
  };
}

function summaryFor(status, reasons, warnings) {
  if (status === "ready") return "Oferta pronta para publicacao semi-automatica.";
  if (reasons.includes("affiliate_not_ready")) return "Configure um link afiliado oficial antes de publicar.";
  if (reasons.includes("missing_price")) return "Preco ausente ou invalido.";
  if (reasons.includes("out_of_stock")) return "Produto indisponivel.";
  if (warnings.includes("price_stale")) return "Preco antigo; revise antes de publicar.";
  if (warnings.includes("mock_source")) return "Oferta veio de mock; nao publique sem validar.";
  if (warnings.includes("missing_image")) return "Oferta sem imagem; revise o card antes de publicar.";
  return "Oferta precisa de revisao.";
}

export function applyValidation(offer, config, now = new Date()) {
  return {
    ...offer,
    ...validateOffer(offer, config, now),
    updatedAt: now.toISOString()
  };
}
