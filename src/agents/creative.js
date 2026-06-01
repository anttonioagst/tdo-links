import Anthropic from "@anthropic-ai/sdk";
import { findOfficialProductImages } from "../imagefinder.js";
import { verifyAmazonProduct } from "../scrapers.js";
import { hasRealPromotion, promotionDiscountPercent } from "../deals.js";
import { extractSpecHighlights, telegramCopy } from "../copywriter.js";

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
  "discord": "copy completa para Discord",
  "x": "tweet"
}

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
- Discord: escreva {LINK} literalmente onde couber o link
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

function fallbackCopy(offer, config) {
  const currentFmt = Number(offer.currentPrice ?? 0).toFixed(2).replace(".", ",");
  const previousFmt = hasRealPromotion(offer) ? Number(offer.previousPrice).toFixed(2).replace(".", ",") : null;
  const discountPct = offer.discountPercent ? Math.round(offer.discountPercent) : null;
  const discountStr = discountPct ? ` (${discountPct}% OFF)` : "";
  const priceStr = previousFmt
    ? `De R$ ${previousFmt} por R$ ${currentFmt}${discountStr}`
    : `Por R$ ${currentFmt}`;
  const title = offer.title || "Oferta Tech";

  return {
    telegram: telegramCopy(offer, "{LINK}"),
    discord: `**📌 ${title}**\n~~R$${previousFmt ?? "?"}~~ → **R$${currentFmt}**${discountStr}\n> Oferta selecionada\n{LINK}`,
    x: `📌 ${title.slice(0, 60)}\n${priceStr}\nVeja no nosso canal 👇`.slice(0, 220)
  };
}

export async function createContent(offer, validationResult, config) {
  console.log("agent_event", JSON.stringify({ agent: "creative", event: "start", title: offer.title }));

  const [imageResult, copyResult] = await Promise.allSettled([
    (async () => {
      // Amazon: always fetch the canonical product page image (first image = white background).
      // This is independent of allowExternalProductImages — we're hitting Amazon, not a third-party search.
      if (offer.store === "amazon" && offer.asin) {
        const verified = await verifyAmazonProduct(offer.asin, config);
        const mainImage = verified.imageUrl || verified.imageUrls?.[0];
        if (mainImage) return [mainImage];
        throw new Error("amazon_product_image_not_found");
      }

      // Non-Amazon: only search external sources if explicitly enabled
      if (!config.allowExternalProductImages) throw new Error("external_product_images_disabled");
      if (!config.openaiApiKey) throw new Error("openai_not_configured");
      return await findOfficialProductImages(offer, config);
    })(),

    (async () => {
      if (!config.anthropicApiKey) return fallbackCopy(offer, config);

      const client = new Anthropic({ apiKey: config.anthropicApiKey });
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 700,
        messages: [{ role: "user", content: buildCopyPrompt(offer, validationResult, config) }]
      });

      const rawText = message.content?.[0]?.text || "";
      const parsed = safeParseJson(rawText);

      if (!parsed?.discord || !parsed?.x) {
        console.log("agent_event", JSON.stringify({ agent: "creative", event: "copy_parse_error", raw: rawText.slice(0, 100) }));
        return fallbackCopy(offer, config);
      }

      if (parsed.x.length > 220) parsed.x = parsed.x.slice(0, 220);
      return {
        telegram: telegramCopy(offer, "{LINK}"),
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
    copy = fallbackCopy(offer, config);
  }

  console.log("agent_event", JSON.stringify({ agent: "creative", event: "done", title: offer.title, imageCount: imageUrls?.length ?? 0 }));

  return { imageUrls, copy };
}
