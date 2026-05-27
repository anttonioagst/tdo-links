import Anthropic from "@anthropic-ai/sdk";
import { findOfficialProductImages } from "../imagefinder.js";

const MODEL = "claude-sonnet-4-6";

function buildCopyPrompt(offer, validationResult, config) {
  const currentFmt = Number(offer.currentPrice ?? 0).toFixed(2).replace(".", ",");
  const previousFmt = offer.previousPrice ? Number(offer.previousPrice).toFixed(2).replace(".", ",") : null;
  const discountPct = offer.discountPercent ? Math.round(offer.discountPercent) : null;
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

Crie copy para 3 canais. Retorne JSON válido exatamente neste formato:
{
  "telegram": "texto aqui",
  "discord": "texto aqui",
  "x": "texto aqui"
}

FORMATO TELEGRAM (siga o modelo EXATO, incluindo linhas em branco):
📌 ${offer.title}

[1 frase chamativa sobre o deal — ex: "Aproveite esta oferta exclusiva na ${storeDisplay} antes que acabe!" ou algo específico do produto]

🔥 ${previousFmt ? `De R$ ${previousFmt} por R$ ${currentFmt}${discountPct ? ` (${discountPct}% OFF)` : ""}` : `Por R$ ${currentFmt}`}

🛒 Ver oferta na ${storeDisplay}:
{LINK}

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
- Telegram: siga o modelo exatamente, não troque os emojis 📌 🔥 🛒
- Telegram/Discord: escreva {LINK} literalmente (será substituído pelo link real)
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

function fallbackCopy(offer) {
  const currentFmt = Number(offer.currentPrice ?? 0).toFixed(2).replace(".", ",");
  const previousFmt = offer.previousPrice ? Number(offer.previousPrice).toFixed(2).replace(".", ",") : null;
  const discountPct = offer.discountPercent ? Math.round(offer.discountPercent) : null;
  const discountStr = discountPct ? ` (${discountPct}% OFF)` : "";
  const priceStr = previousFmt
    ? `De R$ ${previousFmt} por R$ ${currentFmt}${discountStr}`
    : `Por R$ ${currentFmt}`;
  const title = offer.title || "Oferta Tech";
  const storeDisplay = offer.store === "amazon" ? "Amazon"
    : offer.store === "mercado_livre" ? "Mercado Livre"
    : (offer.store || "Loja");

  return {
    telegram: `📌 ${title}\n\nAproveite esta oferta exclusiva na ${storeDisplay} antes que acabe!\n\n🔥 ${priceStr}\n\n🛒 Ver oferta na ${storeDisplay}:\n{LINK}`,
    discord: `**📌 ${title}**\n~~R$${previousFmt ?? "?"}~~ → **R$${currentFmt}**${discountStr}\n> Oferta selecionada\n{LINK}`,
    x: `📌 ${title.slice(0, 60)}\n${priceStr}\nVeja no nosso canal 👇`.slice(0, 220)
  };
}

export async function createContent(offer, validationResult, config) {
  console.log("agent_event", JSON.stringify({ agent: "creative", event: "start", title: offer.title }));

  const [imageResult, copyResult] = await Promise.allSettled([
    (async () => {
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

      if (!parsed?.telegram || !parsed?.discord || !parsed?.x) {
        console.log("agent_event", JSON.stringify({ agent: "creative", event: "copy_parse_error", raw: rawText.slice(0, 100) }));
        return fallbackCopy(offer);
      }

      if (parsed.x.length > 220) parsed.x = parsed.x.slice(0, 220);
      return parsed;
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
