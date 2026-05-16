import { publishTelegram } from "../publishers/telegram.js";
import { publishDiscord } from "../publishers/discord.js";
import { publishXAcquisition } from "../publishers/x.js";

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

export async function publishDeal(offer, content, config, db) {
  console.log("agent_event", JSON.stringify({ agent: "publisher", event: "start", offerId: offer.id, title: offer.title }));

  const affiliateUrl = offer.affiliateUrl || offer.originalUrl || offer.url || "";
  const { imagePath, copy } = content;

  // Attach image path to offer object so telegram publisher can use it
  const offerWithImage = imagePath ? { ...offer, generatedImagePath: imagePath } : offer;

  const results = {};

  // Publish to all 3 channels in parallel, skipping already-published ones (retry safety)
  const tasks = [];

  // Telegram
  if (!wasAlreadyPublished(db, offer.id, "telegram")) {
    tasks.push(
      (async () => {
        try {
          const telegramText = resolveCopy(copy.telegram, affiliateUrl);
          const draft = { text: telegramText };
          const result = await publishTelegram(draft, config, offerWithImage);
          results.telegram = result;
          savePublishResult(db, offer.id, "telegram", result);
          console.log("agent_event", JSON.stringify({ agent: "publisher", event: "telegram_done", offerId: offer.id, ok: result.ok }));
        } catch (err) {
          const result = { ok: false, error: err.message };
          results.telegram = result;
          console.log("agent_event", JSON.stringify({ agent: "publisher", event: "telegram_error", offerId: offer.id, error: err.message }));
        }
      })()
    );
  } else {
    console.log("agent_event", JSON.stringify({ agent: "publisher", event: "telegram_skipped_already_published", offerId: offer.id }));
    results.telegram = { ok: true, skipped: true, detail: "already_published" };
  }

  // Discord
  if (!wasAlreadyPublished(db, offer.id, "discord")) {
    tasks.push(
      (async () => {
        try {
          const discordText = resolveCopy(copy.discord, affiliateUrl);
          const draft = { text: discordText };
          const offerForDiscord = { ...offerWithImage, affiliateUrl };
          const result = await publishDiscord(draft, config, offerForDiscord);
          results.discord = result;
          savePublishResult(db, offer.id, "discord", result);
          console.log("agent_event", JSON.stringify({ agent: "publisher", event: "discord_done", offerId: offer.id, ok: result.ok }));
        } catch (err) {
          const result = { ok: false, error: err.message };
          results.discord = result;
          console.log("agent_event", JSON.stringify({ agent: "publisher", event: "discord_error", offerId: offer.id, error: err.message }));
        }
      })()
    );
  } else {
    console.log("agent_event", JSON.stringify({ agent: "publisher", event: "discord_skipped_already_published", offerId: offer.id }));
    results.discord = { ok: true, skipped: true, detail: "already_published" };
  }

  // X — uses copy.x directly (no affiliate link replacement, has CTA to Telegram+Discord)
  if (!wasAlreadyPublished(db, offer.id, "x")) {
    tasks.push(
      (async () => {
        try {
          const xText = copy.x || "";
          const publishLog = db.state.publishLog || [];
          const result = await publishXAcquisition(xText, config, publishLog);
          results.x = result;
          savePublishResult(db, offer.id, "x", result);
          console.log("agent_event", JSON.stringify({ agent: "publisher", event: "x_done", offerId: offer.id, ok: result.ok }));
        } catch (err) {
          const result = { ok: false, error: err.message };
          results.x = result;
          console.log("agent_event", JSON.stringify({ agent: "publisher", event: "x_error", offerId: offer.id, error: err.message }));
        }
      })()
    );
  } else {
    console.log("agent_event", JSON.stringify({ agent: "publisher", event: "x_skipped_already_published", offerId: offer.id }));
    results.x = { ok: true, skipped: true, detail: "already_published" };
  }

  await Promise.all(tasks);
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
