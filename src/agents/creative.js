import Anthropic from "@anthropic-ai/sdk";
import { generateOfferImage } from "../imagegen.js";

const MODEL = "claude-sonnet-4-6";

function buildCopyPrompt(offer, validationResult, config) {
  const telegramUrl = config.telegramChannelUrl || "t.me/tdolinks";
  const discordUrl = config.discordInviteUrl || "discord.gg/tdolinks";

  return `Você é copywriter do canal brasileiro de deals TDO Links.

Produto: ${offer.title || "Produto Tech"}
Preço: R$ ${offer.currentPrice ?? "N/A"} (era R$ ${offer.previousPrice ?? "N/A"} — ${offer.discountPercent ?? "N/A"}% off)
Avaliação: ${offer.rating ?? "N/A"}/5
Análise do curador: "${validationResult.reason || "Bom deal de tecnologia"}"
Categoria: ${offer.category || "tech"}

Gere copy para 3 canais. JSON válido:
{
  "telegram": "emoji+título\\n\\nDe R$X por R$Y (-Z%)\\n⭐ rating\\n\\n✅ benefício\\n\\n{LINK}\\n\\n#tech #deals",
  "discord": "**emoji título**\\n~~R$X~~ → **R$Y** (-Z%)\\n> benefício\\n{LINK}",
  "x": "🔥 título curtíssimo — R$Y (-Z%)\\n\\nLink nos nossos canais:\\n📱 ${telegramUrl}\\n💬 ${discordUrl}\\n\\n#tech #ofertas"
}
Regras:
- X: máximo 180 chars totais, sem link de afiliado, CTA duplo (Telegram + Discord)
- Telegram/Discord: {LINK} será substituído pelo link de afiliado real
- Emojis de categoria: 💻 tech, 🖱️ mouse, ⌨️ teclado, 🎧 audio, 📱 mobile, 💾 storage, 🖥️ monitor`;
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
  const telegramUrl = config.telegramChannelUrl || "t.me/tdolinks";
  const discordUrl = config.discordInviteUrl || "discord.gg/tdolinks";
  const price = offer.currentPrice ? `R$ ${Number(offer.currentPrice).toFixed(2).replace(".", ",")}` : "Preço especial";
  const discount = offer.discountPercent ? ` (-${Math.round(offer.discountPercent)}%)` : "";

  return {
    telegram: `💻 ${offer.title || "Oferta Tech"}\n\n${price}${discount}\n\n{LINK}\n\n#tech #deals`,
    discord: `**💻 ${offer.title || "Oferta Tech"}**\n${price}${discount}\n{LINK}`,
    x: `🔥 ${(offer.title || "Oferta Tech").slice(0, 60)} ${price}${discount}\n\n📱 ${telegramUrl}\n💬 ${discordUrl}\n\n#tech #ofertas`.slice(0, 180)
  };
}

export async function createContent(offer, validationResult, config) {
  console.log("agent_event", JSON.stringify({ agent: "creative", event: "start", title: offer.title }));

  // Run image generation and copy writing in parallel
  const [imageResult, copyResult] = await Promise.allSettled([
    // Image generation (may fail gracefully)
    (async () => {
      if (!config.openaiApiKey) throw new Error("openai_not_configured");
      return await generateOfferImage(offer, config);
    })(),

    // Copy generation via Claude Sonnet
    (async () => {
      if (!config.anthropicApiKey) {
        return fallbackCopy(offer, config);
      }

      const client = new Anthropic({ apiKey: config.anthropicApiKey });
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 600,
        messages: [
          { role: "user", content: buildCopyPrompt(offer, validationResult, config) }
        ]
      });

      const rawText = message.content?.[0]?.text || "";
      const parsed = safeParseJson(rawText);

      if (!parsed || !parsed.telegram || !parsed.discord || !parsed.x) {
        console.log("agent_event", JSON.stringify({ agent: "creative", event: "copy_parse_error", raw: rawText.slice(0, 100) }));
        return fallbackCopy(offer, config);
      }

      // Enforce X char limit
      if (parsed.x.length > 180) {
        parsed.x = parsed.x.slice(0, 180);
      }

      return parsed;
    })()
  ]);

  // Image: fallback gracefully if it fails
  let imagePath = null;
  if (imageResult.status === "fulfilled") {
    imagePath = imageResult.value;
  } else {
    console.log("agent_event", JSON.stringify({ agent: "creative", event: "image_skipped", error: imageResult.reason?.message }));
  }

  // Copy: use fallback if it fails
  let copy;
  if (copyResult.status === "fulfilled") {
    copy = copyResult.value;
  } else {
    console.log("agent_event", JSON.stringify({ agent: "creative", event: "copy_error", error: copyResult.reason?.message }));
    copy = fallbackCopy(offer, config);
  }

  console.log("agent_event", JSON.stringify({ agent: "creative", event: "done", title: offer.title, hasImage: !!imagePath }));

  return { imagePath, copy };
}
