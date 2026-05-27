import Anthropic from "@anthropic-ai/sdk";
import { findOfficialProductImages } from "../imagefinder.js";

const MODEL = "claude-sonnet-4-6";

function buildCopyPrompt(offer, validationResult, config) {
  const isPremium = (offer.currentPrice ?? 0) >= 500;
  const currentFmt = Number(offer.currentPrice ?? 0).toFixed(2).replace(".", ",");
  const previousFmt = offer.previousPrice ? Number(offer.previousPrice).toFixed(2).replace(".", ",") : null;
  const discountStr = offer.discountPercent ? ` (-${Math.round(offer.discountPercent)}%)` : "";
  const priceBlock = previousFmt
    ? `<s>R$${previousFmt}</s> por <b>R$${currentFmt}</b>${discountStr}`
    : `<b>R$${currentFmt}</b>`;

  return `Você é o copywriter do canal TDO Links no estilo SDM Links — direto, sem enrolação, emojis variados por categoria.

Produto: ${offer.title}
Preço atual: R$ ${currentFmt}
Preço anterior: ${previousFmt ? `R$ ${previousFmt}` : "indisponível"}
Desconto: ${offer.discountPercent ? `${Math.round(offer.discountPercent)}%` : "indisponível"}
Avaliação: ${offer.rating ?? "N/A"}/5 (${offer.reviewCount ?? 0} avaliações)
Categoria: ${offer.category || "tech"}
Premium (≥R$500): ${isPremium ? "sim" : "não"}
Curador: "${validationResult.reason || "Bom deal de tecnologia"}"

Crie copy para 3 canais. Retorne JSON válido exatamente neste formato:
{
  "telegram": "texto aqui",
  "discord": "texto aqui",
  "x": "texto aqui"
}

FORMATO TELEGRAM (use HTML do Telegram — <b> negrito, <s> riscado):
🚨 [emoji da categoria] [Nome curto da categoria]:
${isPremium ? "\n[1 frase curta explicando por que vale a pena — apenas para premium]\n" : ""}
${offer.title}
${priceBlock}
{LINK}

FORMATO DISCORD:
**🚨 [emoji] [categoria]:**
~~R$${previousFmt ?? "?"}~~ → **R$${currentFmt}**${discountStr}
> [frase de valor em 1 linha]
{LINK}

FORMATO X (máximo 220 chars, sem link afiliado):
🚨 [emoji] [categoria]:
[título produto ~60 chars]
De R$${previousFmt ?? "?"} | Por R$${currentFmt}${discountStr}
Veja no nosso canal 👇

REGRAS:
- Emojis: 💻 notebook/laptop, 🖱️ mouse, ⌨️ teclado, 🎧 audio/headset/fone, 📱 celular/smartphone, 💾 ssd/storage, 🖥️ monitor, 🔌 hub/cabo/carregador, 📷 câmera, 🪑 cadeira, 🫧 outros
- Telegram/Discord: escreva {LINK} literalmente (será substituído pelo link real)
- X: sem link afiliado, sem hashtags, máximo 220 chars
- Telegram: mantenha as tags HTML exatamente como no exemplo (<s>, <b>), não adicione outras tags`;
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
  const discountStr = offer.discountPercent ? ` (-${Math.round(offer.discountPercent)}%)` : "";
  const priceBlock = previousFmt
    ? `<s>R$${previousFmt}</s> por <b>R$${currentFmt}</b>${discountStr}`
    : `<b>R$${currentFmt}</b>`;
  const title = offer.title || "Oferta Tech";

  return {
    telegram: `🚨 💻 Tech:\n\n${title}\n${priceBlock}\n{LINK}`,
    discord: `**🚨 💻 Tech:**\n~~R$${previousFmt ?? "?"}~~ → **R$${currentFmt}**${discountStr}\n> Oferta selecionada\n{LINK}`,
    x: `🚨 💻 Tech:\n${title.slice(0, 60)}\nDe R$${previousFmt ?? "?"} | Por R$${currentFmt}${discountStr}\nVeja no nosso canal 👇`.slice(0, 220)
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
