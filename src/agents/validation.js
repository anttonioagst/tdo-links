import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001";

// ---------------------------------------------------------------------------
// Hard gates — evaluated BEFORE calling the LLM (saves cost, no exceptions)
// ---------------------------------------------------------------------------

// Only brands that actually convert. Redragon, Havit, generic mice etc. are out.
const PREMIUM_BRANDS = [
  "logitech", "hyperx", "razer", "sony", "jbl", "samsung", "lg", "dell",
  "kingston", "sandisk", "anker", "soundcore", "tp-link", "corsair",
  "steelseries", "crucial", "wd", "western digital", "aoc", "asus", "lenovo",
  "apple", "philips", "benq", "gigabyte", "msi", "seagate", "acer", "tcl",
  "hisense", "husky", "flexform", "elgato", "rode", "nvidia", "intel", "amd",
  "kanto", "edifier", "marshall", "bose", "sennheiser", "jabra", "plantronics",
  "corsair", "nzxt", "fractal", "be quiet", "cooler master", "thermaltake"
];

// Minimum discount to be worth posting (eye-catching deal)
const MIN_DISCOUNT_PCT = 18;

// Minimum price — filters out sub-R$100 accessories that don't convert
const MIN_PRICE = 120;

function premiumBrandGate(offer) {
  const title = String(offer.title || "").toLowerCase();
  const hasPremiumBrand = PREMIUM_BRANDS.some((b) => title.includes(b));
  if (!hasPremiumBrand) {
    return { pass: false, reason: "brand_not_premium: apenas marcas premium aprovadas (Logitech, Razer, HyperX, Apple, Samsung, LG, Sony, etc.)" };
  }
  const price = Number(offer.currentPrice || 0);
  if (price < MIN_PRICE) {
    return { pass: false, reason: `price_too_low: R$${price.toFixed(0)} abaixo do mínimo R$${MIN_PRICE} — produto não converte` };
  }
  const prev = Number(offer.previousPrice || 0);
  const curr = Number(offer.currentPrice || 0);
  const discountPct = prev > curr ? Math.round(((prev - curr) / prev) * 100) : Number(offer.discountPercent || 0);
  if (discountPct < MIN_DISCOUNT_PCT) {
    return { pass: false, reason: `discount_too_low: ${discountPct}% de desconto abaixo do mínimo ${MIN_DISCOUNT_PCT}% — desconto não brilha os olhos` };
  }
  return { pass: true };
}

function buildValidationPrompt(offer) {
  const hasDiscount = offer.previousPrice && offer.previousPrice > offer.currentPrice;
  const discountLine = hasDiscount
    ? `Preço atual: R$ ${offer.currentPrice} | Era: R$ ${offer.previousPrice} (${offer.discountPercent}% off)`
    : `Preço atual: R$ ${offer.currentPrice ?? "N/A"} | Sem histórico de preço anterior`;

  return `Você é curador de deals PREMIUM de tecnologia para o mercado brasileiro. Seu padrão é alto — apenas o que realmente brilha os olhos de um entusiasta de tech.

Produto: ${offer.title || "Desconhecido"}
${discountLine}
Avaliação: ${offer.rating ?? "N/A"}/5 (${offer.reviewCount ?? "N/A"} reviews)
Loja: ${offer.store || "Desconhecida"}

CRITÉRIOS DE APROVAÇÃO (todos devem ser atendidos):
1. Marca premium consolidada: Logitech, HyperX, Razer, Sony, JBL, Samsung, LG, Dell, Apple, Anker/Soundcore, TP-Link, Corsair, SteelSeries, ASUS, Lenovo, Acer, AOC, BenQ, Kingston, Seagate, WD, MSI, Gigabyte, TCL, Philips, Flexform, Husky.
2. Desconto que chama atenção: 20%+ em produtos até R$500; 15%+ em produtos acima de R$500 (R$100+ de economia já é impacto).
3. Produto desejável: notebooks, monitores, TVs, headsets/fones, SSDs, teclados mecânicos, mouses premium (MX Master, G502, Basilisk, DeathAdder — NÃO genérico), câmeras, soundbars, roteadores mesh.
4. Avaliação decente: 4.0+ (4.5+ preferível). Zero reviews = suspeito, rejeite salvo marca muito forte.

REJEITE SEMPRE:
- Marcas desconhecidas ou genéricas (Redragon, Havit, C3Tech, marcas sem histórico)
- Mouses/teclados baratos sem destaque de marca (qualquer coisa que parece genérico)
- Acessórios simples (cabos, capas, suportes básicos)
- Produtos sem desconto significativo ou com preço anterior suspeito/inflado

Responda SOMENTE em JSON válido:
{"valid": true|false, "confidence": 0-100, "reason": "frase curta justificando"}`;
}

function safeParseJson(text) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export async function validateDeal(offer, config) {
  // Hard gate — no LLM cost for obvious rejects
  const gate = premiumBrandGate(offer);
  if (!gate.pass) {
    console.log("agent_event", JSON.stringify({ agent: "validation", event: "hard_reject", title: offer.title, reason: gate.reason }));
    return { valid: false, confidence: 98, reason: gate.reason };
  }

  if (!config.anthropicApiKey) {
    console.log("agent_event", JSON.stringify({ agent: "validation", event: "skip_no_api_key" }));
    return { valid: true, confidence: 100, reason: "legacy_mode_no_api_key" };
  }

  console.log("agent_event", JSON.stringify({ agent: "validation", event: "start", title: offer.title }));

  try {
    const client = new Anthropic({ apiKey: config.anthropicApiKey });

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 150,
      messages: [
        { role: "user", content: buildValidationPrompt(offer) }
      ]
    });

    const rawText = message.content?.[0]?.text || "";
    const parsed = safeParseJson(rawText);

    if (!parsed || typeof parsed.valid !== "boolean" || typeof parsed.confidence !== "number") {
      console.log("agent_event", JSON.stringify({ agent: "validation", event: "parse_error", raw: rawText.slice(0, 100) }));
      return { valid: false, confidence: 0, reason: "response_parse_error" };
    }

    const threshold = config.aiConfidenceThreshold ?? 70;
    const passes = parsed.valid === true && parsed.confidence >= threshold;

    console.log("agent_event", JSON.stringify({
      agent: "validation",
      event: "done",
      title: offer.title,
      valid: parsed.valid,
      confidence: parsed.confidence,
      passes,
      reason: parsed.reason
    }));

    return {
      valid: parsed.valid,
      confidence: parsed.confidence,
      reason: parsed.reason || ""
    };
  } catch (err) {
    console.log("agent_event", JSON.stringify({ agent: "validation", event: "error", error: err.message }));
    return { valid: false, confidence: 0, reason: `validation_error: ${err.message}` };
  }
}
