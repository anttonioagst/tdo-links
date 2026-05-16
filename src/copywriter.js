import { trackedUrl } from "./links.js";

const CATEGORY_EMOJI = {
  ssd: "💾",
  hd: "💾",
  pendrive: "💾",
  mouse: "🖱️",
  teclado: "⌨️",
  keyboard: "⌨️",
  notebook: "💻",
  laptop: "💻",
  monitor: "🖥️",
  headphone: "🎧",
  fone: "🎧",
  airpods: "🎧",
  tv: "📺",
  celular: "📱",
  smartphone: "📱",
  iphone: "📱",
  galaxy: "📱",
  tenis: "👟",
  tênis: "👟",
  hub: "🔌",
  cabo: "🔌",
  carregador: "🔌",
  camera: "📷",
  câmera: "📷",
  cadeira: "🪑",
  impressora: "🖨️"
};

function categoryEmoji(offer) {
  const text = `${offer.title} ${offer.category}`.toLowerCase();
  for (const [key, emoji] of Object.entries(CATEGORY_EMOJI)) {
    if (text.includes(key)) return emoji;
  }
  return "🫧";
}

function getPostUrl(offer, shortCode, config) {
  if (offer.affiliateSource === "manual" && offer.affiliateUrl) return offer.affiliateUrl;
  return trackedUrl(config, shortCode);
}

export function money(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function createTelegramCopy(offer, shortCode, config) {
  return telegramCopy(offer, getPostUrl(offer, shortCode, config), config.disclosure);
}

export function createXPostCopy(offer, shortCode, config) {
  return xCopy(offer, getPostUrl(offer, shortCode, config));
}

export function telegramCopy(offer, url, disclosure) {
  const previous = offer.previousPrice ? money(offer.previousPrice) : "preço normal";
  return [
    "🚨 Super Promoção:",
    `${categoryEmoji(offer)} ${discountLine(offer)}`,
    "",
    offer.title,
    `De ${previous} | Por ${money(offer.currentPrice)}`,
    "",
    url,
    disclosure
  ].join("\n");
}

export function xCopy(offer, url) {
  const previous = offer.previousPrice ? money(offer.previousPrice) : "preço normal";
  return [
    "🚨 Super Promoção:",
    `${categoryEmoji(offer)} ${discountLine(offer)}`,
    "",
    offer.title,
    `De ${previous} | Por ${money(offer.currentPrice)}`,
    "",
    `Ad ${storeLabel(offer.store)}: ${url}`
  ].join("\n").slice(0, 280);
}

export function createXAcquisitionCopy(topOffers, config) {
  const offer = topOffers[0];
  if (!offer) return "";
  const link = config.xProfileUrl || "Links no Telegram.";
  return [
    "🚨 Super Promoção:",
    `${categoryEmoji(offer)} ${discountLine(offer)}`,
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
