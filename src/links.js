export function buildAffiliateUrl(offer, config, channel = "") {
  if (offer.affiliateSource === "manual" && offer.affiliateUrl && /^https?:\/\//.test(offer.affiliateUrl)) return offer.affiliateUrl;
  if (!offer.originalUrl && offer.affiliateUrl && /^https?:\/\//.test(offer.affiliateUrl)) return offer.affiliateUrl;
  const url = new URL(offer.originalUrl);
  const amazonTag = amazonTrackingTag(config, channel);
  if (offer.store === "amazon" && amazonTag) {
    url.searchParams.set("tag", amazonTag);
  }
  if (offer.store === "mercado_livre" && config.mercadoLivreAffiliateParam) {
    const [key, value] = config.mercadoLivreAffiliateParam.split("=");
    if (key && value) url.searchParams.set(key, value);
  }
  return url.toString();
}

export function hasAffiliateConfig(offer, config) {
  if (offer.store === "amazon") return Boolean(amazonTrackingTag(config));
  if (offer.store === "mercado_livre") return Boolean(config.mercadoLivreAffiliateParam);
  return Boolean(offer.affiliateUrl && offer.affiliateUrl !== offer.originalUrl);
}

export function createShortCode(db, offerId, channel) {
  return `${channel.slice(0, 2)}_${offerId.slice(-6)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function trackedUrl(config, shortCode) {
  return `${config.publicBaseUrl}/go/${encodeURIComponent(shortCode)}`;
}

function amazonTrackingTag(config, channel = "") {
  const byChannel = {
    telegram: config.amazonAffiliateTagTelegram,
    x: config.amazonAffiliateTagX,
    admin: config.amazonAffiliateTagAdmin
  };
  return byChannel[channel] || config.amazonAffiliateTag || "";
}
