export function normalizeOfferTitle(title) {
  return String(title || "")
    .replace(/&#x27;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(test|oferta|promocao|promo)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function offerIdentityKeys(offer = {}) {
  const keys = [];
  if (offer.asin) keys.push(`asin:${String(offer.asin).toLowerCase()}`);
  const canonicalUrl = canonicalOfferUrl(offer);
  if (canonicalUrl) keys.push(`url:${canonicalUrl}`);
  const title = normalizeOfferTitle(offer.title);
  if (title.length >= 24) keys.push(`title:${title}`);
  return keys;
}

export function wasSimilarOfferPublished(state = {}, offer = {}, channel = "telegram") {
  const currentKeys = new Set(offerIdentityKeys(offer));
  if (!currentKeys.size) return false;
  const offersById = new Map((state.offers || []).map((item) => [item.id, item]));

  return (state.publishLog || []).some((entry) => {
    if (entry.channel !== channel || entry.result?.ok !== true || !entry.offerId) return false;
    const publishedOffer = offersById.get(entry.offerId);
    if (!publishedOffer) return false;
    return offerIdentityKeys(publishedOffer).some((key) => currentKeys.has(key));
  });
}

export function relatedOfferRecentlyPublished(state = {}, offer = {}, channel = "telegram", hours = 24, now = new Date()) {
  const currentKey = offerFamilyKey(offer);
  if (!currentKey) return false;
  const cutoff = new Date(now.getTime() - Number(hours || 24) * 60 * 60 * 1000);
  const offersById = new Map((state.offers || []).map((item) => [item.id, item]));

  return (state.publishLog || []).some((entry) => {
    if (entry.channel !== channel || entry.result?.ok !== true || !entry.offerId) return false;
    if (new Date(entry.createdAt) < cutoff) return false;
    const publishedOffer = offersById.get(entry.offerId);
    return offerFamilyKey(publishedOffer) === currentKey;
  });
}

export function offerFamilyKey(offer = {}) {
  const title = normalizeOfferTitle(offer.title)
    .replace(/\b\d+\s?(pol|polegadas|inch|in|hz|w|mah|gb|tb|ms|m2|m)\b/g, " ")
    .replace(/\b\d{2,5}\b/g, " ")
    .replace(/\b(4k|8k|full hd|qhd|uhd|rgb|bluetooth|wifi|wi fi)\b/g, " ")
    .replace(/\b(white|black|preto|branco|azul|rosa|grafite)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (title.length < 18) return "";
  return `family:${title}`;
}

function canonicalOfferUrl(offer = {}) {
  if (offer.canonicalUrl) return String(offer.canonicalUrl).toLowerCase();
  const raw = offer.originalUrl || offer.url || "";
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "").toLowerCase();
  } catch {
    return String(raw).split("?")[0].replace(/\/+$/, "").toLowerCase();
  }
}
