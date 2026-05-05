import { trackedUrl } from "./links.js";

export function money(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function createTelegramCopy(offer, shortCode, config) {
  return telegramCopy(offer, trackedUrl(config, shortCode), config.disclosure);
}

export function createXPostCopy(offer, shortCode, config) {
  return xCopy(offer, trackedUrl(config, shortCode));
}

export function telegramCopy(offer, url, disclosure) {
  return [
    baseCopy(offer, "🫧"),
    "",
    `Agora, na ${storeLabel(offer.store)}:`,
    url,
    disclosure
  ].join("\n");
}

export function xCopy(offer, url) {
  return [
    baseCopy(offer, "🫧"),
    "",
    `Ad ${storeLabel(offer.store)}: ${url}`
  ].join("\n").slice(0, 280);
}

function baseCopy(offer, icon) {
  const previous = offer.previousPrice ? money(offer.previousPrice) : "preço normal";
  return [
    "🚨 Super Promoção:",
    `${icon} ${discountLine(offer)}`,
    "",
    offer.title,
    `De ${previous} | Por ${money(offer.currentPrice)}`
  ].join("\n");
}

export function createXAcquisitionCopy(topOffers, config) {
  const offer = topOffers[0];
  if (!offer) return "";
  const link = config.xProfileUrl || "Links no Telegram.";
  return [
    "🚨 Super Promoção:",
    `💦 ${discountLine(offer)}`,
    "",
    offer.title,
    `Por ${money(offer.currentPrice)}`,
    "",
    `Ad ${storeLabel(offer.store)}: ${link}`
  ].join("\n").slice(0, 280);
}

export function storeLabel(store) {
  const labels = {
    amazon: "Amazon",
    mercado_livre: "Mercado Livre",
    nike: "Nike",
    kabum: "KaBuM",
    magalu: "Magalu",
    shopee: "Shopee"
  };
  return labels[store] || store;
}

function discountLine(offer) {
  const amountOff = offer.previousPrice && offer.previousPrice > offer.currentPrice
    ? money(offer.previousPrice - offer.currentPrice)
    : "";
  if (amountOff) return `${shortCategory(offer)} com ${amountOff} OFF.`;
  if (offer.discountPercent) return `${shortCategory(offer)} com ${offer.discountPercent}% OFF.`;
  return "Oferta selecionada com preço em destaque.";
}

function shortCategory(offer) {
  if (offer.category && offer.category !== "tech") return offer.category;
  const title = String(offer.title || "").toLowerCase();
  if (title.includes("ssd")) return "SSD";
  if (title.includes("mouse")) return "Mouse";
  if (title.includes("hub")) return "Hub";
  if (title.includes("air max") || title.includes("tenis") || title.includes("tênis")) return "Tênis";
  return "Tech";
}
