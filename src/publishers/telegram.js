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
    const text = formatTelegramText(draft, offer);
    const images = offerImages(offer);
    if (images.length > 1) {
      const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMediaGroup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: config.telegramChatId,
          media: images.map((image, index) => ({
            type: "photo",
            media: image,
            ...(index === 0 ? { caption: text, parse_mode: "HTML" } : {})
          }))
        })
      });
      const payload = await response.json().catch(() => ({}));
      return { ok: response.ok && payload.ok, dryRun: false, providerMessageId: payload.result?.[0]?.message_id || null, detail: payload.description || "ok" };
    }
    const hasImage = images.length === 1;
    const method = hasImage ? "sendPhoto" : "sendMessage";
    const body = hasImage
      ? { chat_id: config.telegramChatId, photo: images[0], caption: text, parse_mode: "HTML" }
      : { chat_id: config.telegramChatId, text, parse_mode: "HTML", disable_web_page_preview: false };
    const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
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
