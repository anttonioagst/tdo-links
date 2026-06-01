import { trackedUrl } from "./links.js";
import { hasRealPromotion, promotionDiscountPercent } from "./deals.js";

const CATEGORY_EMOJI = {
  ssd: "💾", hd: "💾", pendrive: "💾",
  mouse: "🖱️", teclado: "⌨️", keyboard: "⌨️",
  notebook: "💻", laptop: "💻",
  monitor: "🖥️",
  headphone: "🎧", fone: "🎧", airpods: "🎧", headset: "🎧",
  tv: "📺",
  celular: "📱", smartphone: "📱", iphone: "📱", galaxy: "📱",
  tenis: "👟", tênis: "👟",
  hub: "🔌", cabo: "🔌", carregador: "🔌",
  camera: "📷", câmera: "📷",
  cadeira: "🪑",
  impressora: "🖨️"
};

const PREMIUM_LINE = {
  notebook: "Performance e portabilidade no mesmo pacote.",
  laptop: "Performance e portabilidade no mesmo pacote.",
  monitor: "Mais tela, mais foco, mais produtividade.",
  iphone: "O melhor da Apple pelo melhor preço do ano.",
  galaxy: "Câmera incrível, tela top, desempenho fluido.",
  smartphone: "Desempenho premium com custo-benefício real.",
  câmera: "Qualidade profissional de imagem acessível.",
  camera: "Qualidade profissional de imagem acessível.",
  headset: "Áudio imersivo para gaming e reuniões.",
  headphone: "Qualidade de som que você vai sentir a diferença.",
  fone: "Áudio premium com preço bem abaixo do normal.",
  áudio: "Áudio premium com preço bem abaixo do normal.",
  cadeira: "Ergonomia que cuida de você em longas jornadas.",
  ssd: "Velocidade real. Tudo mais rápido no seu setup."
};

function categoryEmoji(offer) {
  const text = `${offer.title} ${offer.category}`.toLowerCase();
  for (const [key, emoji] of Object.entries(CATEGORY_EMOJI)) {
    if (text.includes(key)) return emoji;
  }
  return "🫧";
}

function shortCategory(offer) {
  if (offer.category && offer.category !== "tech") return offer.category;
  const title = String(offer.title || "").toLowerCase();
  if (title.includes("ssd")) return "SSD";
  if (title.includes("notebook") || title.includes("laptop")) return "Notebook";
  if (title.includes("monitor")) return "Monitor";
  if (title.includes("mouse")) return "Mouse";
  if (title.includes("teclado") || title.includes("keyboard")) return "Teclado";
  if (title.includes("headset") || title.includes("headphone") || title.includes("fone")) return "Áudio";
  if (title.includes("câmera") || title.includes("camera")) return "Câmera";
  if (title.includes("smartphone") || title.includes("celular") || title.includes("iphone") || title.includes("galaxy")) return "Smartphone";
  if (title.includes("hub")) return "Hub USB";
  if (title.includes("carregador")) return "Carregador";
  if (title.includes("cabo")) return "Cabo";
  if (title.includes("tenis") || title.includes("tênis")) return "Tênis";
  return "Tech";
}

function premiumLine(offer) {
  const text = `${offer.title} ${offer.category}`.toLowerCase();
  for (const [key, line] of Object.entries(PREMIUM_LINE)) {
    if (text.includes(key)) return line;
  }
  return "Custo-benefício difícil de ignorar.";
}

function addUniqueSpec(specs, value) {
  const clean = String(value || "").trim();
  if (!clean || clean.length > 42) return;
  if (specs.some((spec) => spec.toLowerCase() === clean.toLowerCase())) return;
  specs.push(clean);
}

export function extractSpecHighlights(offer, candidateSpecs = []) {
  const specs = [];
  for (const spec of candidateSpecs) {
    const clean = String(spec || "")
      .replace(/^[-•\s]+/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (/r\$\s?\d|%|off|promo|oferta|imperd/i.test(clean)) continue;
    addUniqueSpec(specs, clean);
    if (specs.length >= 2) return specs;
  }

  const text = `${offer.title || ""} ${offer.category || ""}`;
  const lower = text.toLowerCase();
  const patterns = [
    [/noise cancelling|cancelamento de ru[ií]do|\banc\b/i, "Cancelamento de ruído"],
    [/bluetooth/i, "Bluetooth"],
    [/sem fio|wireless/i, "Sem fio"],
    [/mec[aâ]nico|mechanical/i, "Teclado mecânico"],
    [/ergon[oô]mico|ergonomic/i, "Ergonômico"],
    [/oled/i, "Tela OLED"],
    [/\bqled\b/i, "Tela QLED"],
    [/\b4k\b|ultra hd|\buhd\b/i, "Imagem 4K"],
    [/\bfull\s?hd\b/i, "Full HD"],
    [/\bips\b/i, "Painel IPS"],
    [/\b(\d{2,3})\s?hz\b/i, (match) => `${match[1]}Hz`],
    [/\b(\d+)\s?tb\b/i, (match) => `${match[1]}TB`],
    [/\b(\d+)\s?gb\b/i, (match) => `${match[1]}GB`],
    [/\bnvme\b/i, "SSD NVMe"],
    [/\bssd\b/i, "SSD"],
    [/\brtx\s?\d{3,4}\b/i, (match) => match[0].toUpperCase().replace(/\s+/, " ")],
    [/\bgtx\s?\d{3,4}\b/i, (match) => match[0].toUpperCase().replace(/\s+/, " ")],
    [/\bryzen\s?\d\b/i, (match) => match[0].replace(/\s+/, " ")],
    [/\bintel\b|\bi[3579]\b/i, "Processador Intel"]
  ];

  for (const [pattern, label] of patterns) {
    const match = lower.match(pattern);
    if (!match) continue;
    addUniqueSpec(specs, typeof label === "function" ? label(match) : label);
    if (specs.length >= 2) break;
  }

  return specs;
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
  if (!hasRealPromotion(offer)) {
    throw new Error("missing_real_promotion");
  }
  const current = money(offer.currentPrice);
  const previous = money(offer.previousPrice);
  const discountPct = promotionDiscountPercent(offer);
  const discountStr = ` (${discountPct}% OFF)`;
  const store = storeLabel(offer.store);
  const hook = `Aproveite esta oferta exclusiva na ${store} antes que acabe!`;
  const specLines = extractSpecHighlights(offer).map((spec) => `• ${spec}`);

  return [
    `📌 <b>${offer.title}</b>`,
    "",
    hook,
    specLines.length ? "" : null,
    ...specLines,
    "",
    `🔥 De <s>${previous}</s> por <b>${current}</b>${discountStr}`,
    "",
    `🛒 Ver oferta na ${store}:`,
    url,
    disclosure ? `\n${disclosure}` : null
  ].filter(v => v !== null).join("\n");
}

export function xCopy(offer, url) {
  const emoji = categoryEmoji(offer);
  const label = shortCategory(offer);
  const current = money(offer.currentPrice);
  const previous = offer.previousPrice ? money(offer.previousPrice) : null;
  const priceStr = previous ? `De ${previous} | Por ${current}` : `Por ${current}`;
  const store = storeLabel(offer.store);

  return [
    `🚨 ${emoji} ${label}:`,
    offer.title,
    priceStr,
    url
  ].join("\n").slice(0, 280);
}

export function createXAcquisitionCopy(topOffers, config) {
  const offer = topOffers[0];
  if (!offer) return "";
  const link = config.xProfileUrl || "Links no Telegram.";
  const emoji = categoryEmoji(offer);
  const label = shortCategory(offer);
  const current = money(offer.currentPrice);

  return [
    `🚨 ${emoji} ${label}:`,
    offer.title,
    `Por ${current}`,
    link
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
  return labels[store] || store || "Loja";
}
