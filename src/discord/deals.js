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

export function buildDiscordDealMessage(offer = {}, affiliateUrl = "") {
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
      url: affiliateUrl || offer.affiliateUrl || offer.originalUrl || offer.url || undefined,
      image: bestImage(offer) ? { url: bestImage(offer) } : undefined,
      fields: specs.map((spec) => ({ name: spec.name, value: spec.value, inline: true })),
      timestamp: new Date().toISOString()
    }]
  };
}

export async function publishDiscordDeal(db, config, offer, options = {}) {
  if (!config.discordPublicDealsEnabled) return { ok: true, skipped: true, reason: "discord_public_deals_disabled" };
  const channelName = discordDealChannelForOffer(offer);
  let channelId = db.state.discord?.channels?.[channelName];
  if (!channelId) {
    const setup = await ensureDiscordChannel(db, config, channelName, options);
    channelId = db.state.discord?.channels?.[channelName];
    if (!channelId) {
      return { ok: false, skipped: true, reason: "discord_channel_missing", channel: channelName, setupError: setup?.error || null };
    }
  }
  const client = options.client || createDiscordClient(config, options);
  await client.createMessage(channelId, buildDiscordDealMessage(offer, offer.affiliateUrl));
  return { ok: true, channel: channelName };
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
