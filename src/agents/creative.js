import Anthropic from "@anthropic-ai/sdk";
import { generateOfferImagePack } from "../imagegen.js";

const MODEL = "claude-sonnet-4-6";

function buildCopyPrompt(offer, validationResult, config) {
  const isPremium = (offer.currentPrice ?? 0) >= 500;
  const currentFmt = Number(offer.currentPrice ?? 0).toFixed(2).replace(".", ",");
  const previousFmt = offer.previousPrice ? Number(offer.previousPrice).toFixed(2).replace(".", ",") : null;

  return `Você é o copywriter do canal TDO Links no estilo SDM Links — direto, sem enrolação, emojis variados por categoria.

Produto: ${offer.title}
Preço atual: R$ ${currentFmt}
Preço anterior: ${previousFmt ? `R$ ${previousFmt}` : "indisponível"}
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

FORMATO TELEGRAM:
🚨 [emoji da categoria] [Nome curto da categoria]:
${isPremium ? "[1 frase curta explicando por que vale a pena — apenas para premium]\n" : ""}${offer.title}
De R$${previousFmt ?? "?"} | Por R$${currentFmt}
Ad [Loja]: {LINK}

FORMATO DISCORD:
**🚨 [emoji] [categoria]:**
~~R$${previousFmt ?? "?"}~~ → **R$${currentFmt}**
> [frase de valor em 1 linha]
{LINK}

FORMATO X (máximo 220 chars, sem link afiliado):
🚨 [emoji] [categoria]:
[título produto ~60 chars]
De R$${previousFmt ?? "?"} | Por R$${currentFmt}
Veja no nosso canal 👇

REGRAS:
- Emojis: 💻 notebook/laptop, 🖱️ mouse, ⌨️ teclado, 🎧 audio/headset/fone, 📱 celular/smartphone, 💾 ssd/storage, 🖥️ monitor, 🔌 hub/cabo/carregador, 📷 câmera, 🪑 cadeira, 🫧 outros
- Telegram/Discord: escreva {LINK} literalmente (será substituído pelo link real)
- X: sem link afiliado, sem hashtags, máximo 220 chars
- Nunca escreva percentual de desconto (não escreva "30% off" ou similares)`;
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
  const priceStr = previousFmt ? `De R$${previousFmt} | Por R$${currentFmt}` : `Por R$${currentFmt}`;
  const title = offer.title || "Oferta Tech";

  return {
    telegram: `🚨 💻 Tech:\n${title}\n${priceStr}\nAd Loja: {LINK}`,
    discord: `**🚨 💻 Tech:**\n~~R$${previousFmt ?? "?"}~~ → **R$${currentFmt}**\n> Oferta selecionada\n{LINK}`,
    x: `🚨 💻 Tech:\n${title.slice(0, 60)}\n${priceStr}\nVeja no nosso canal 👇`.slice(0, 220)
  };
}

export async function createContent(offer, validationResult, config) {
  console.log("agent_event", JSON.stringify({ agent: "creative", event: "start", title: offer.title }));

  const [imageResult, copyResult] = await Promise.allSettled([
    (async () => {
      if (!config.openaiApiKey) throw new Error("openai_not_configured");
      return await generateOfferImagePack(offer, config);
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

  let imagePaths = null;
  if (imageResult.status === "fulfilled") {
    imagePaths = imageResult.value;
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

  console.log("agent_event", JSON.stringify({ agent: "creative", event: "done", title: offer.title, imageCount: imagePaths?.length ?? 0 }));

  return { imagePaths, imagePath: imagePaths?.[0] ?? null, copy };
}
