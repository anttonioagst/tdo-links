import { createDiscordClient } from "./client.js";
import { setupDiscordServer } from "./setup.js";

// Avoid hammering the Discord API when provisioning keeps failing (e.g. missing
// permissions). One auto-setup attempt per cooldown window is enough.
const AUTO_SETUP_COOLDOWN_MS = 10 * 60 * 1000;
let lastAutoSetupAttempt = 0;

// Self-healing: if the target channel isn't mapped yet, provision the Discord
// structure once so deals can post without a manual /api/discord/setup call.
async function ensureDiscordChannel(db, config, channelName, options = {}) {
  if (db.state.discord?.channels?.[channelName]) return { ok: true, cached: true };
  if (!config.discordBotToken || !config.discordGuildId) {
    return { ok: false, error: "discord_bot_not_configured" };
  }
  const now = Date.now();
  if (now - lastAutoSetupAttempt < AUTO_SETUP_COOLDOWN_MS) {
    return { ok: false, error: "auto_setup_cooldown" };
  }
  lastAutoSetupAttempt = now;
  return setupDiscordServer(db, config, options);
}

export function discordDealChannelForOffer(offer = {}) {
  const text = `${offer.category || ""} ${offer.title || ""}`.toLowerCase();
  if (/(notebook|laptop|macbook|aspire|ideapad|vivobook|dell|lenovo|acer|asus)/.test(text)) return "notebooks";
  if (/(smart\s*tv|\btv\b|televis[aã]o|oled|qned|crystal uhd)/.test(text)) return "tvs";
  if (/(monitor|ultragear|odyssey|aoc)/.test(text)) return "monitores";
  if (/(headset|fone|headphone|soundbar|caixa de som|jbl|soundcore|audio|áudio)/.test(text)) return "audio-headsets";
  if (/(cadeira|mesa|escrivaninha|flexform|ergon[oô]mica)/.test(text)) return "cadeiras-mesas";
  if (/(mouse|teclado|mousepad|razer|hyperx|logitech|redragon|setup|gamer)/.test(text)) return "setup-gamer";
  return "ofertas-do-dia";
}

export function buildDiscordDealMessage(offer = {}, copyText = "") {
  const image = bestImage(offer);
  // Mirror Telegram: same caption + same product image in a single embed.
  // Telegram copy uses HTML (<b>, <s>); convert it to Discord markdown.
  if (copyText) {
    return {
      embeds: [{
        description: htmlToDiscordMarkdown(copyText).slice(0, 4096),
        color: 0x22c55e,
        image: image ? { url: image } : undefined,
        timestamp: new Date().toISOString()
      }]
    };
  }
  // Legacy fallback (no Telegram copy available): structured embed.
  const current = money(offer.currentPrice);
  const previous = money(offer.previousPrice);
  const discount = offer.discountPercent ? ` (${Math.round(offer.discountPercent)}% OFF)` : "";
  const specs = compactSpecs(offer);
  return {
    embeds: [{
      title: `📌 ${offer.title || "Oferta TDO Links"}`.slice(0, 250),
      description: previous
        ? `De ~~${previous}~~ por **${current}**${discount}`
        : `Por **${current}**${discount}`,
      color: 0x22c55e,
      url: offer.affiliateUrl || offer.originalUrl || offer.url || undefined,
      image: image ? { url: image } : undefined,
      fields: specs.map((spec) => ({ name: spec.name, value: spec.value, inline: true })),
      timestamp: new Date().toISOString()
    }]
  };
}

// Telegram caption is HTML; Discord renders markdown. Keep the text identical,
// only swap the formatting tags.
function htmlToDiscordMarkdown(text = "") {
  return String(text)
    .replace(/<\/?(b|strong)>/gi, "**")
    .replace(/<\/?(s|strike|del)>/gi, "~~")
    .replace(/<\/?(i|em)>/gi, "*")
    .replace(/<br\s*\/?>(?:\n)?/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

const DAILY_CHANNEL = "ofertas-do-dia";

export async function publishDiscordDeal(db, config, offer, options = {}) {
  if (!config.discordPublicDealsEnabled) return { ok: true, skipped: true, reason: "discord_public_deals_disabled" };

  // Always post to the daily feed, plus the product's category channel (deduped).
  const categoryName = discordDealChannelForOffer(offer);
  const targets = [...new Set([DAILY_CHANNEL, categoryName])];

  const client = options.client || createDiscordClient(config, options);
  const message = buildDiscordDealMessage(offer, options.text || "");

  const posted = [];
  const missing = [];
  let lastSetupError = null;

  for (const channelName of targets) {
    let channelId = db.state.discord?.channels?.[channelName];
    if (!channelId) {
      const setup = await ensureDiscordChannel(db, config, channelName, options);
      channelId = db.state.discord?.channels?.[channelName];
      if (!channelId) {
        missing.push(channelName);
        lastSetupError = setup?.error || lastSetupError;
        continue;
      }
    }
    await client.createMessage(channelId, message);
    posted.push(channelName);
  }

  if (!posted.length) {
    return { ok: false, skipped: true, reason: "discord_channel_missing", channels: missing, setupError: lastSetupError };
  }
  return { ok: true, channels: posted, channel: posted[0], skippedChannels: missing.length ? missing : undefined };
}

function money(value) {
  if (!value) return "";
  return `R$ ${Number(value).toFixed(2).replace(".", ",")}`;
}

function compactSpecs(offer) {
  const fields = [];
  if (offer.rating) fields.push({ name: "Avaliação", value: `${offer.rating}${offer.reviewCount ? ` (${offer.reviewCount})` : ""}` });
  if (offer.store) fields.push({ name: "Loja", value: String(offer.store) });
  if (offer.discountPercent) fields.push({ name: "Desconto", value: `${Math.round(offer.discountPercent)}%` });
  return fields.slice(0, 4);
}

function bestImage(offer) {
  return offer.officialImageUrls?.[0] ||
    offer.imageUrls?.[0] ||
    offer.imageUrl ||
    null;
}
