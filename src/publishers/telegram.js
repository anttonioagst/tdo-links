import sharp from "sharp";

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

const DEFAULT_MIN_TELEGRAM_PHOTO_BYTES = 25_000;
const MAX_TELEGRAM_PHOTO_BYTES = 9_500_000;
const TELEGRAM_SQUARE_PHOTO_SIZE = 1200;

function categoryEmoji(offer) {
  return CATEGORY_EMOJI[offer?.category] ?? CATEGORY_EMOJI.default;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
        chat_id: config.telegramChatId, photo: offer.telegramImageFileId, caption: text, parse_mode: "HTML"
      });
      if (result.ok) return result;
    }

    // Official product images fetched by the creative agent
    if (offer?.officialImageUrls?.length) {
      const result = await sendBestImage(botUrl, config.telegramChatId, offer.officialImageUrls, text, offer);
      if (result.ok) return result;
      console.log("telegram_official_images_fallback", JSON.stringify({ detail: result.detail }));
    }

    // Legacy imageUrl/imageUrls fields (scrape pipeline) — normalize and upload best candidate
    const images = offerImages(offer);
    if (images.length >= 1) {
      const photoResult = await sendBestImage(botUrl, config.telegramChatId, images, text, offer);
      if (photoResult.ok) return photoResult;
      console.log("telegram_photo_failed", JSON.stringify({ detail: photoResult.detail }));
    }

    return { ok: false, dryRun: false, providerMessageId: null, detail: "telegram_photo_required" };
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

export function normalizeTelegramImageUrl(url) {
  const value = String(url || "");
  if (!/^https?:\/\//.test(value)) return value;
  try {
    const parsed = new URL(value);
    if (!/amazon\./i.test(parsed.hostname) && parsed.hostname !== "m.media-amazon.com") return value;
    parsed.pathname = parsed.pathname.replace(
      /(\._)[^.\/]+(\.(?:jpe?g|png|webp))$/i,
      "$1AC_SL1500_$2"
    );
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return value;
  }
}

function telegramImageCandidates(urls) {
  const candidates = [];
  for (const url of urls || []) {
    if (!/^https?:\/\//.test(url || "")) continue;
    const normalized = normalizeTelegramImageUrl(url);
    candidates.push(normalized, url);
  }
  return [...new Set(candidates)].slice(0, 8);
}

export async function selectBestTelegramPhoto(urls, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const minBytes = options.minBytes ?? DEFAULT_MIN_TELEGRAM_PHOTO_BYTES;
  const candidates = telegramImageCandidates(urls);
  const downloaded = await Promise.all(candidates.map((url) => downloadTelegramPhoto(url, fetchImpl)));
  const valid = downloaded
    .filter(Boolean)
    .filter((item) => item.buffer.length >= minBytes)
    .filter((item) => item.buffer.length <= MAX_TELEGRAM_PHOTO_BYTES)
    .sort((a, b) => b.buffer.length - a.buffer.length);
  return valid[0] || null;
}

export async function squareTelegramPhoto(photo, size = TELEGRAM_SQUARE_PHOTO_SIZE) {
  const buffer = Buffer.isBuffer(photo) ? photo : photo?.buffer;
  if (!buffer?.length) throw new Error("missing_photo_buffer");
  const squared = await sharp(buffer)
    .rotate()
    .resize(size, size, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
  return {
    ...photo,
    buffer: squared,
    contentType: "image/jpeg"
  };
}

async function downloadTelegramPhoto(url, fetchImpl) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TDOLinks/1.0)" }
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(contentType)) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return { url, buffer, contentType: contentType === "image/jpg" ? "image/jpeg" : contentType };
  } catch {
    return null;
  }
}

// Downloads the best product image and uploads it directly to bypass CDN blocks.
// Mutates offer.telegramImageFileId on success so future sends skip the upload.
async function sendBestImage(botUrl, chatId, urls, caption, offer = null) {
  if (!urls?.length) return { ok: false, dryRun: false, providerMessageId: null, detail: "no_images_provided" };

  try {
    const selected = await selectBestTelegramPhoto(urls);
    if (!selected) return { ok: false, dryRun: false, providerMessageId: null, detail: "no_high_quality_image" };
    const square = await squareTelegramPhoto(selected);

    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", caption.slice(0, 1024));
    form.append("parse_mode", "HTML");
    form.append("photo", new Blob([square.buffer], { type: square.contentType }), imageFilename(square.contentType));
    const response = await fetch(`${botUrl}/sendPhoto`, { method: "POST", body: form });
    const payload = await response.json().catch(() => ({}));
    if (offer && payload.result?.photo) {
      const fileId = payload.result.photo.slice(-1)[0]?.file_id;
      if (fileId) offer.telegramImageFileId = fileId;
    }
    return { ok: response.ok && payload.ok, dryRun: false, providerMessageId: payload.result?.message_id || null, detail: payload.description || "ok" };
  } catch (error) {
    return { ok: false, dryRun: false, providerMessageId: null, detail: `image_download_failed: ${error?.message}` };
  }
}

function imageFilename(contentType) {
  if (contentType === "image/png") return "product.png";
  if (contentType === "image/webp") return "product.webp";
  return "product.jpg";
}

function telegramProviderFailure(error) {
  return { ok: false, dryRun: false, providerMessageId: null, detail: `Telegram provider failure: ${error?.message || String(error)}` };
}

function offerImages(offer) {
  return [...new Set([...(offer?.imageUrls || []), offer?.imageUrl].filter((url) => /^https?:\/\//.test(url || "")))].slice(0, 4);
}
