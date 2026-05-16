import { readFile } from "node:fs/promises";

const CATEGORY_EMOJI = {
  SSD: "💾",
  notebook: "💻",
  periférico: "🖱️",
  monitor: "🖥️",
  headset: "🎧",
  smartphone: "📱",
  câmera: "📷",
  impressora: "🖨️",
  roteador: "📡",
  default: "🏷️"
};

function categoryEmoji(offer) {
  return CATEGORY_EMOJI[offer?.category] ?? CATEGORY_EMOJI.default;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatTelegramText(draft, offer) {
  if (!offer || !offer.currentPrice) return escapeHtml(draft.text);
  const emoji = categoryEmoji(offer);
  const title = escapeHtml(offer.title || offer.url || "Oferta");
  const current = `R$ ${Number(offer.currentPrice).toFixed(2).replace(".", ",")}`;
  const previous = offer.previousPrice
    ? `<s>R$ ${Number(offer.previousPrice).toFixed(2).replace(".", ",")}</s> por `
    : "";
  const discount = offer.discountPercent ? ` <b>(-${Math.round(offer.discountPercent)}%)</b>` : "";
  const rating = offer.rating ? `\n⭐ ${offer.rating}${offer.reviewCount ? ` (${offer.reviewCount} avaliações)` : ""}` : "";
  const link = offer.affiliateUrl || offer.url || "";
  const linkLine = link ? `\n🔗 <a href="${escapeHtml(link)}">Ver oferta</a>` : "";
  const disclosure = draft.disclosure
    ? `\n\n<i>${escapeHtml(draft.disclosure)}</i>`
    : "";
  return `${emoji} <b>${title}</b>\n${previous}<b>${current}</b>${discount}${rating}${linkLine}${disclosure}`;
}

export async function testTelegram(config) {
  if (config.telegramDryRun || !config.telegramBotToken || !config.telegramChatId) {
    return {
      ok: false,
      dryRun: config.telegramDryRun,
      providerMessageId: null,
      detail: "Teste nao enviado: dry-run ativo ou credenciais ausentes."
    };
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: config.telegramChatId,
        text: "TDO Links: teste de integração Telegram concluído. ✅",
        parse_mode: "HTML"
      })
    });
    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok && payload.ok === true,
      dryRun: false,
      providerMessageId: payload.result?.message_id || null,
      detail: payload.description || (response.ok ? "ok" : `HTTP ${response.status}`)
    };
  } catch (error) {
    return telegramProviderFailure(error);
  }
}

export async function publishTelegram(draft, config, offer = null) {
  if (config.telegramDryRun) {
    return { ok: true, dryRun: true, providerMessageId: null, detail: "Telegram dry-run ativo." };
  }
  if (!config.telegramBotToken || !config.telegramChatId) {
    return { ok: false, dryRun: false, providerMessageId: null, detail: "Telegram credentials missing." };
  }
  try {
    const text = draft.text || "";
    const botUrl = `https://api.telegram.org/bot${config.telegramBotToken}`;

    if (offer?.generatedImagePath) {
      return await sendGeneratedImage(botUrl, config.telegramChatId, offer, text);
    }

    const images = offerImages(offer);
    if (images.length > 1) {
      const response = await fetch(`${botUrl}/sendMediaGroup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: config.telegramChatId,
          media: images.map((image, index) => ({
            type: "photo",
            media: image,
            ...(index === 0 ? { caption: text } : {})
          }))
        })
      });
      const payload = await response.json().catch(() => ({}));
      return { ok: response.ok && payload.ok, dryRun: false, providerMessageId: payload.result?.[0]?.message_id || null, detail: payload.description || "ok" };
    }
    const hasImage = images.length === 1;
    const method = hasImage ? "sendPhoto" : "sendMessage";
    const body = hasImage
      ? { chat_id: config.telegramChatId, photo: images[0], caption: text }
      : { chat_id: config.telegramChatId, text, disable_web_page_preview: false };
    return await telegramRequest(`${botUrl}/${method}`, body);
  } catch (error) {
    return telegramProviderFailure(error);
  }
}

async function telegramRequest(url, body, retries = 2) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 429 && retries > 0) {
    const retryAfter = (payload.parameters?.retry_after ?? 15) + 1;
    console.log("telegram_rate_limit", JSON.stringify({ retryAfter, retriesLeft: retries - 1 }));
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    return telegramRequest(url, body, retries - 1);
  }
  return { ok: response.ok && payload.ok === true, dryRun: false, providerMessageId: payload.result?.message_id || null, detail: payload.description || "ok" };
}

async function sendGeneratedImage(botUrl, chatId, offer, caption) {
  try {
    const buffer = await readFile(offer.generatedImagePath);
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", caption);
    form.append("photo", new Blob([buffer], { type: "image/jpeg" }), "product.jpg");
    const response = await fetch(`${botUrl}/sendPhoto`, { method: "POST", body: form });
    const payload = await response.json().catch(() => ({}));
    if (payload.result?.photo) {
      const fileId = payload.result.photo.slice(-1)[0]?.file_id;
      if (fileId) offer.telegramImageFileId = fileId;
    }
    return { ok: response.ok && payload.ok, dryRun: false, providerMessageId: payload.result?.message_id || null, detail: payload.description || "ok" };
  } catch (error) {
    return telegramProviderFailure(error);
  }
}

function telegramProviderFailure(error) {
  return { ok: false, dryRun: false, providerMessageId: null, detail: `Telegram provider failure: ${error?.message || String(error)}` };
}

function offerImages(offer) {
  return [...new Set([...(offer?.imageUrls || []), offer?.imageUrl].filter((url) => /^https?:\/\//.test(url || "")))].slice(0, 4);
}
