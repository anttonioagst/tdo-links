import Anthropic from "@anthropic-ai/sdk";
import { findOfficialProductImages } from "../imagefinder.js";
import { verifyAmazonProduct } from "../scrapers.js";
import { hasRealPromotion, promotionDiscountPercent } from "../deals.js";
import { extractSpecHighlights } from "../copywriter.js";

const MODEL = "claude-sonnet-4-6";

function buildCopyPrompt(offer, validationResult, config) {
  const currentFmt = Number(offer.currentPrice ?? 0).toFixed(2).replace(".", ",");
  const previousFmt = offer.previousPrice ? Number(offer.previousPrice).toFixed(2).replace(".", ",") : null;
  const discountPct = promotionDiscountPercent(offer);
  const storeDisplay = offer.store === "amazon" ? "Amazon"
    : offer.store === "mercado_livre" ? "Mercado Livre"
    : (offer.store || "Loja");

  return `Você é o copywriter do canal TDO Links — direto, sem enrolação, estilo deal hunter brasileiro.

Produto: ${offer.title}
Preço atual: R$ ${currentFmt}
Preço anterior: ${previousFmt ? `R$ ${previousFmt}` : "indisponível"}
Desconto: ${discountPct ? `${discountPct}%` : "indisponível"}
Avaliação: ${offer.rating ?? "N/A"}/5 (${offer.reviewCount ?? 0} avaliações)
Loja: ${storeDisplay}
Curador: "${validationResult.reason || "Bom deal de tecnologia"}"

Retorne JSON válido exatamente neste formato:
{
  "hook": "1 frase chamativa sobre o deal para o Telegram",
  "specs": ["especificação curta 1", "especificação curta 2"],
  "discord": "copy completa para Discord",
  "x": "tweet"
}

CAMPO hook: 1 frase curta e concreta sobre o valor do produto/deal. Sem exageros genéricos.
CAMPO specs: no máximo 2 itens, cada um com 2 a 6 palavras, só especificações reais do produto/título. Não invente. Não repita preço, desconto, loja ou urgência.

FORMATO DISCORD:
**📌 ${offer.title}**
~~R$${previousFmt ?? "?"}~~ → **R$${currentFmt}**${discountPct ? ` (${discountPct}% OFF)` : ""}
> [frase de valor em 1 linha]
{LINK}

FORMATO X (máximo 220 chars, sem link afiliado):
📌 [título ~60 chars]
${previousFmt ? `De R$${previousFmt} por R$${currentFmt}` : `Por R$${currentFmt}`}${discountPct ? ` (${discountPct}% OFF)` : ""}
Veja no nosso canal 👇

REGRAS:
- Discord/X: escreva {LINK} literalmente onde couber o link
- X: sem link afiliado, sem hashtags, máximo 220 chars`;
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

function buildTelegramCopy(offer, hook, specs = []) {
  if (!hasRealPromotion(offer)) {
    throw new Error("missing_real_promotion");
  }
  const currentFmt = Number(offer.currentPrice ?? 0).toFixed(2).replace(".", ",");
  const previousFmt = Number(offer.previousPrice).toFixed(2).replace(".", ",");
  const discountPct = hasRealPromotion(offer) ? promotionDiscountPercent(offer) : null;
  const discountStr = ` (${discountPct}% OFF)`;
  const priceLine = `🔥 De <s>R$ ${previousFmt}</s> por <b>R$ ${currentFmt}</b>${discountStr}`;
  const storeDisplay = offer.store === "amazon" ? "Amazon"
    : offer.store === "mercado_livre" ? "Mercado Livre"
    : (offer.store || "Loja");
  const specLines = extractSpecHighlights(offer, specs).map((spec) => `• ${spec}`);

  return [
    `📌 <b>${offer.title || "Oferta Tech"}</b>`,
    "",
    hook,
    specLines.length ? "" : null,
    ...specLines,
    "",
    priceLine,
    "",
    `🛒 Ver oferta na ${storeDisplay}:`,
    "{LINK}"
  ].filter((line) => line !== null).join("\n");
}

function fallbackCopy(offer) {
  const currentFmt = Number(offer.currentPrice ?? 0).toFixed(2).replace(".", ",");
  const previousFmt = hasRealPromotion(offer) ? Number(offer.previousPrice).toFixed(2).replace(".", ",") : null;
  const discountPct = offer.discountPercent ? Math.round(offer.discountPercent) : null;
  const discountStr = discountPct ? ` (${discountPct}% OFF)` : "";
  const priceStr = previousFmt
    ? `De R$ ${previousFmt} por R$ ${currentFmt}${discountStr}`
    : `Por R$ ${currentFmt}`;
  const title = offer.title || "Oferta Tech";
  const storeDisplay = offer.store === "amazon" ? "Amazon"
    : offer.store === "mercado_livre" ? "Mercado Livre"
    : (offer.store || "Loja");
  const specs = extractSpecHighlights(offer);
  const hook = specs.length
    ? `Oferta forte para quem busca ${specs[0].toLowerCase()} sem pagar preço cheio.`
    : `Oferta selecionada na ${storeDisplay} com desconto real.`;

  return {
    telegram: buildTelegramCopy(offer, hook, specs),
    discord: `**📌 ${title}**\n~~R$${previousFmt ?? "?"}~~ → **R$${currentFmt}**${discountStr}\n> Oferta selecionada\n{LINK}`,
    x: `📌 ${title.slice(0, 60)}\n${priceStr}\nVeja no nosso canal 👇`.slice(0, 220)
  };
}

export async function createContent(offer, validationResult, config) {
  console.log("agent_event", JSON.stringify({ agent: "creative", event: "start", title: offer.title }));

  const [imageResult, copyResult] = await Promise.allSettled([
    (async () => {
      if (!config.allowExternalProductImages) throw new Error("external_product_images_disabled");

      // For Amazon products, use the canonical product page image (white background, product focus).
      // Manufacturer site searches (Brave/SerpAPI) often return promotional or lifestyle images.
      if (offer.store === "amazon" && offer.asin) {
        const verified = await verifyAmazonProduct(offer.asin, config);
        const mainImage = verified.imageUrl || verified.imageUrls?.[0];
        if (mainImage) return [mainImage];
        throw new Error("amazon_product_image_not_found");
      }

      if (!config.openaiApiKey) throw new Error("openai_not_configured");
      return await findOfficialProductImages(offer, config);
    })(),

    (async () => {
      if (!config.anthropicApiKey) return fallbackCopy(offer);

      const client = new Anthropic({ apiKey: config.anthropicApiKey });
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 700,
        messages: [{ role: "user", content: buildCopyPrompt(offer, validationResult, config) }]
      });

      const rawText = message.content?.[0]?.text || "";
      const parsed = safeParseJson(rawText);

      if (!parsed?.hook || !parsed?.discord || !parsed?.x) {
        console.log("agent_event", JSON.stringify({ agent: "creative", event: "copy_parse_error", raw: rawText.slice(0, 100) }));
        return fallbackCopy(offer);
      }

      if (parsed.x.length > 220) parsed.x = parsed.x.slice(0, 220);
      const specs = extractSpecHighlights(offer, Array.isArray(parsed.specs) ? parsed.specs : []);
      return {
        telegram: buildTelegramCopy(offer, parsed.hook, specs),
        discord: parsed.discord,
        x: parsed.x
      };
    })()
  ]);

  let imageUrls = null;
  if (imageResult.status === "fulfilled" && imageResult.value?.length) {
    imageUrls = imageResult.value;
  } else {
    console.log("agent_event", JSON.stringify({ agent: "creative", event: "image_skipped", error: imageResult.reason?.message }));
  }

  let copy;
  if (copyResult.status === "fulfilled") {
    copy = copyResult.value;
  } else {
    console.log("agent_event", JSON.stringify({ agent: "creative", event: "copy_error", error: copyResult.reason?.message }));
    copy = fallbackCopy(offer);
  }

  console.log("agent_event", JSON.stringify({ agent: "creative", event: "done", title: offer.title, imageCount: imageUrls?.length ?? 0 }));

  return { imageUrls, copy };
}
