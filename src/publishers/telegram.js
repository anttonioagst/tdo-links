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

    // Use cached Telegram file_id — no re-upload needed
    if (offer?.telegramImageFileId) {
      const result = await telegramRequest(`${botUrl}/sendPhoto`, {
        chat_id: config.telegramChatId, photo: offer.telegramImageFileId, caption: text
      });
      if (result.ok) return result;
    }

    // Official product images fetched by the creative agent
    if (offer?.officialImageUrls?.length) {
      const result = await sendOfficialImages(botUrl, config.telegramChatId, offer.officialImageUrls, text, offer);
      if (result.ok) return result;
      console.log("telegram_official_images_fallback", JSON.stringify({ detail: result.detail }));
    }

    // Legacy imageUrl/imageUrls fields (scrape pipeline)
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
      if (response.ok && payload.ok) {
        return { ok: true, dryRun: false, providerMessageId: payload.result?.[0]?.message_id || null, detail: "ok" };
      }
      console.log("telegram_media_group_failed", JSON.stringify({ detail: payload.description }));
    }

    if (images.length >= 1) {
      const photoResult = await telegramRequest(`${botUrl}/sendPhoto`, {
        chat_id: config.telegramChatId, photo: images[0], caption: text
      });
      if (photoResult.ok) return photoResult;
      console.log("telegram_photo_failed", JSON.stringify({ detail: photoResult.detail }));
    }

    // Fallback: text only (Amazon CDN often blocked by Telegram servers)
    return await telegramRequest(`${botUrl}/sendMessage`, {
      chat_id: config.telegramChatId, text, disable_web_page_preview: false
    });
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

// Downloads product images and uploads them directly to bypass CDN blocks.
// Mutates offer.telegramImageFileId on success so future sends skip the upload.
async function sendOfficialImages(botUrl, chatId, urls, caption, offer = null) {
  const downloaded = (await Promise.all(
    urls.slice(0, 4).map(async (url) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { "User-Agent": "Mozilla/5.0 (compatible; TDOLinks/1.0)" }
        });
        clearTimeout(timeout);
        if (!res.ok) return null;
        const buffer = Buffer.from(await res.arrayBuffer());
        const contentType = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
        return { buffer, contentType };
      } catch {
        return null;
      }
    })
  )).filter(Boolean);

  if (!downloaded.length) return { ok: false, dryRun: false, providerMessageId: null, detail: "no_images_downloaded" };

  if (downloaded.length === 1) {
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", caption.slice(0, 1024));
    form.append("photo", new Blob([downloaded[0].buffer], { type: downloaded[0].contentType }), "product.jpg");
    const response = await fetch(`${botUrl}/sendPhoto`, { method: "POST", body: form });
    const payload = await response.json().catch(() => ({}));
    if (offer && payload.result?.photo) {
      const fileId = payload.result.photo.slice(-1)[0]?.file_id;
      if (fileId) offer.telegramImageFileId = fileId;
    }
    return { ok: response.ok && payload.ok, dryRun: false, providerMessageId: payload.result?.message_id || null, detail: payload.description || "ok" };
  }

  const form = new FormData();
  form.append("chat_id", chatId);
  const mediaArr = [];
  for (let i = 0; i < downloaded.length; i++) {
    form.append(`photo${i}`, new Blob([downloaded[i].buffer], { type: downloaded[i].contentType }), `product_${i + 1}.jpg`);
    mediaArr.push({ type: "photo", media: `attach://photo${i}`, ...(i === 0 ? { caption: caption.slice(0, 1024) } : {}) });
  }
  form.append("media", JSON.stringify(mediaArr));
  const response = await fetch(`${botUrl}/sendMediaGroup`, { method: "POST", body: form });
  const payload = await response.json().catch(() => ({}));
  if (response.ok && payload.ok) {
    if (offer) {
      const firstPhoto = payload.result?.[0]?.photo;
      if (firstPhoto) offer.telegramImageFileId = firstPhoto.slice(-1)[0]?.file_id;
    }
    return { ok: true, dryRun: false, providerMessageId: payload.result?.[0]?.message_id || null, detail: "ok" };
  }
  return { ok: false, dryRun: false, providerMessageId: null, detail: payload.description || "media_group_failed" };
}

function telegramProviderFailure(error) {
  return { ok: false, dryRun: false, providerMessageId: null, detail: `Telegram provider failure: ${error?.message || String(error)}` };
}

function offerImages(offer) {
  return [...new Set([...(offer?.imageUrls || []), offer?.imageUrl].filter((url) => /^https?:\/\//.test(url || "")))].slice(0, 4);
}
