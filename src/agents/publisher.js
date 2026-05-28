import { publishTelegram } from "../publishers/telegram.js";
import { publishDiscord } from "../publishers/discord.js";
import { publishXAcquisition } from "../publishers/x.js";
import { buildAffiliateUrl } from "../links.js";

const INTER_CHANNEL_DELAY_MS = 3000;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function resolveCopy(template, affiliateUrl) {
  return (template || "").replace(/\{LINK\}/g, affiliateUrl || "");
}

function wasAlreadyPublished(db, offerId, channel) {
  const log = db.state.publishLog || [];
  return log.some(entry =>
    entry.offerId === offerId &&
    entry.channel === channel &&
    entry.result?.ok === true
  );
}

function savePublishResult(db, offerId, channel, result) {
  if (!db.state.publishLog) db.state.publishLog = [];
  db.state.publishLog.unshift({
    id: db.nextId ? db.nextId("pub") : `pub_${Date.now()}_${channel}`,
    offerId,
    channel,
    result,
    createdAt: new Date().toISOString()
  });
}

function recentTelegramPublishes(db, config) {
  const maxPerCycle = config.maxPublicationsPerCycle ?? 2;
  const windowHours = config.publicationWindowHours ?? 2;
  const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  const count = (db.state.publishLog || [])
    .filter((entry) => entry.result?.ok && entry.channel === "telegram" && entry.createdAt >= windowStart)
    .length;
  return { count, maxPerCycle, windowHours };
}

export async function publishDeal(offer, content, config, db) {
  console.log("agent_event", JSON.stringify({ agent: "publisher", event: "start", offerId: offer.id, title: offer.title }));
  if (db.load) await db.load();

  let affiliateUrl;
  try {
    affiliateUrl = buildAffiliateUrl(offer, config, "telegram");
  } catch {
    affiliateUrl = offer.affiliateUrl || offer.originalUrl || offer.url || "";
  }
  const { imageUrls, copy } = content;
  const offerWithImage = imageUrls?.length
    ? { ...offer, officialImageUrls: imageUrls }
    : offer;
  const results = {};

  // Build ordered list of channels to publish (lazy functions, not promises)
  const channels = [];

  const quota = recentTelegramPublishes(db, config);
  if (quota.count >= quota.maxPerCycle) {
    results.telegram = { ok: true, skipped: true, detail: "telegram_quota_reached" };
    console.log("agent_event", JSON.stringify({
      agent: "publisher",
      event: "telegram_skipped_quota",
      offerId: offer.id,
      recentPublished: quota.count,
      maxPerCycle: quota.maxPerCycle,
      windowHours: quota.windowHours
    }));
  } else if (!wasAlreadyPublished(db, offer.id, "telegram")) {
    channels.push(async () => {
      try {
        const draft = { text: resolveCopy(copy.telegram, affiliateUrl) };
        const result = await publishTelegram(draft, config, offerWithImage);
        results.telegram = result;
        savePublishResult(db, offer.id, "telegram", result);
        if (result.ok && offerWithImage.telegramImageFileId) {
          const offerInDb = db.state.offers.find(o => o.id === offer.id);
          if (offerInDb) offerInDb.telegramImageFileId = offerWithImage.telegramImageFileId;
        }
        console.log("agent_event", JSON.stringify({ agent: "publisher", event: "telegram_done", offerId: offer.id, ok: result.ok }));
      } catch (err) {
        results.telegram = { ok: false, error: err.message };
        console.log("agent_event", JSON.stringify({ agent: "publisher", event: "telegram_error", offerId: offer.id, error: err.message }));
      }
    });
  } else {
    results.telegram = { ok: true, skipped: true, detail: "already_published" };
    console.log("agent_event", JSON.stringify({ agent: "publisher", event: "telegram_skipped", offerId: offer.id }));
  }

  if (!wasAlreadyPublished(db, offer.id, "discord")) {
    channels.push(async () => {
      try {
        const draft = { text: resolveCopy(copy.discord, affiliateUrl) };
        const offerForDiscord = { ...offerWithImage, affiliateUrl };
        const result = await publishDiscord(draft, config, offerForDiscord);
        results.discord = result;
        savePublishResult(db, offer.id, "discord", result);
        console.log("agent_event", JSON.stringify({ agent: "publisher", event: "discord_done", offerId: offer.id, ok: result.ok }));
      } catch (err) {
        results.discord = { ok: false, error: err.message };
        console.log("agent_event", JSON.stringify({ agent: "publisher", event: "discord_error", offerId: offer.id, error: err.message }));
      }
    });
  } else {
    results.discord = { ok: true, skipped: true, detail: "already_published" };
    console.log("agent_event", JSON.stringify({ agent: "publisher", event: "discord_skipped", offerId: offer.id }));
  }

  if (!wasAlreadyPublished(db, offer.id, "x")) {
    channels.push(async () => {
      try {
        const result = await publishXAcquisition(copy.x || "", config, db.state.publishLog || []);
        results.x = result;
        savePublishResult(db, offer.id, "x", result);
        console.log("agent_event", JSON.stringify({ agent: "publisher", event: "x_done", offerId: offer.id, ok: result.ok }));
      } catch (err) {
        results.x = { ok: false, error: err.message };
        console.log("agent_event", JSON.stringify({ agent: "publisher", event: "x_error", offerId: offer.id, error: err.message }));
      }
    });
  } else {
    results.x = { ok: true, skipped: true, detail: "already_published" };
    console.log("agent_event", JSON.stringify({ agent: "publisher", event: "x_skipped", offerId: offer.id }));
  }

  // Sequential with delay to avoid Telegram 429 rate limits
  for (let i = 0; i < channels.length; i++) {
    await channels[i]();
    if (i < channels.length - 1) await sleep(INTER_CHANNEL_DELAY_MS);
  }

  await db.save();

  console.log("agent_event", JSON.stringify({
    agent: "publisher",
    event: "done",
    offerId: offer.id,
    telegram: results.telegram?.ok,
    discord: results.discord?.ok,
    x: results.x?.ok
  }));

  return results;
}
