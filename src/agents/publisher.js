import { publishTelegram } from "../publishers/telegram.js";
import { publishDiscord } from "../publishers/discord.js";
import { publishXAcquisition } from "../publishers/x.js";
import { buildAffiliateUrl } from "../links.js";
import { telegramPublicationStatus } from "../publication-policy.js";
import { relatedOfferRecentlyPublished, wasSimilarOfferPublished } from "../publication-dedupe.js";
import { publishDiscordDeal } from "../discord/deals.js";
import { reportAgentEvent } from "../discord/reporter.js";
import { verifyAmazonProduct } from "../scrapers.js";

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
  let offerWithImage = imageUrls?.length
    ? { ...offer, officialImageUrls: imageUrls }
    : offer;
  const results = {};

  // Build ordered list of channels to publish (lazy functions, not promises)
  const channels = [];

  const publication = telegramPublicationStatus(db.state.publishLog || [], config);
  if (wasSimilarOfferPublished(db.state, offer, "telegram")) {
    results.telegram = { ok: true, skipped: true, detail: "duplicate_offer" };
    console.log("agent_event", JSON.stringify({ agent: "publisher", event: "telegram_skipped_duplicate", offerId: offer.id }));
    await safeReport(db, config, {
      agent: "publisher",
      severity: "warning",
      title: "Telegram bloqueou duplicata",
      message: "A oferta não foi enviada porque já existe publicação recente equivalente.",
      data: { offerId: offer.id, motivo: "duplicate_offer" }
    });
  } else if (relatedOfferRecentlyPublished(db.state, offer, "telegram", config.relatedOfferDedupeHours ?? 24)) {
    results.telegram = { ok: true, skipped: true, detail: "related_offer_recently_published" };
    console.log("agent_event", JSON.stringify({ agent: "publisher", event: "telegram_skipped_related", offerId: offer.id }));
    await safeReport(db, config, {
      agent: "publisher",
      severity: "warning",
      title: "Telegram bloqueou família repetida",
      message: "A oferta parece variante de produto já publicado nas últimas horas.",
      data: { offerId: offer.id, janelaHoras: config.relatedOfferDedupeHours ?? 24 }
    });
  } else if (!publication.allowed) {
    results.telegram = { ok: true, skipped: true, detail: publication.reason, waitMinutes: publication.waitMinutes };
    console.log("agent_event", JSON.stringify({
      agent: "publisher",
      event: "telegram_skipped_policy",
      offerId: offer.id,
      reason: publication.reason,
      recentPublished: publication.recentPublished,
      maxPerCycle: publication.maxPerCycle,
      windowHours: publication.windowHours,
      waitMinutes: publication.waitMinutes
    }));
    await safeReport(db, config, {
      agent: "publisher",
      severity: "warning",
      title: "Telegram aguardando cadência",
      message: "A oferta está pronta, mas foi segurada pela regra de espaçamento.",
      data: { offerId: offer.id, motivo: publication.reason, esperaMin: publication.waitMinutes }
    });
  } else if (!wasAlreadyPublished(db, offer.id, "telegram")) {
    offer = await refreshExactAmazonMedia(offer, config, db);
    if (offer.imageVerificationFailed) {
      return blockImageUnverified(db, config, offer);
    }
    offerWithImage = imageUrls?.length
      ? { ...offer, officialImageUrls: imageUrls }
      : offer;
    channels.push(async () => {
      try {
        const draft = { text: resolveCopy(copy.telegram, affiliateUrl) };
        const result = await publishTelegram(draft, config, offerWithImage);
        results.telegram = result;
        savePublishResult(db, offer.id, "telegram", result);
        const offerInDb = db.state.offers.find(o => o.id === offer.id);
        if (result.ok && offerWithImage.telegramImageFileId) {
          if (offerInDb) offerInDb.telegramImageFileId = offerWithImage.telegramImageFileId;
        } else if (!result.ok && result.detail === "telegram_photo_required" && offerInDb) {
          offerInDb.status = "rejected";
          offerInDb.imageStatus = "failed";
          offerInDb.validationSummary = "telegram_photo_required";
          offerInDb.updatedAt = new Date().toISOString();
        }
        await safeReport(db, config, {
          agent: "publisher",
          severity: result.ok ? "info" : "warning",
          title: result.ok ? "Telegram publicado" : "Falha no Telegram",
          message: result.ok ? "Oferta enviada para o Telegram." : result.detail || result.error || "Falha ao publicar no Telegram.",
          data: { offerId: offer.id, messageId: result.providerMessageId || "", detail: result.detail || "" }
        });
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
        const offerForDiscord = { ...offerWithImage, affiliateUrl };
        // Mirror Telegram on Discord: same copy + same image.
        const discordText = resolveCopy(copy.telegram, affiliateUrl);
        // Prefer the bot posting to category channels (self-provisions channels
        // when missing). Fall back to the webhook only when it can actually send.
        const botResult = await publishDiscordDeal(db, config, offerForDiscord, { text: discordText }).catch((error) => ({
          ok: false,
          detail: error?.message || String(error)
        }));
        let result;
        if (botResult?.ok) {
          result = botResult;
        } else if (config.discordWebhookUrl && !config.discordDryRun) {
          const draft = { text: resolveCopy(copy.discord, affiliateUrl) };
          result = await publishDiscord(draft, config, offerForDiscord);
        } else {
          // Surface the real bot reason instead of a misleading webhook dry-run "ok".
          result = botResult || { ok: false, detail: "no_discord_method_configured" };
        }
        results.discord = result;
        savePublishResult(db, offer.id, "discord", result);
        const skipped = result.skipped === true;
        await safeReport(db, config, {
          agent: "publisher",
          severity: result.ok ? "info" : (skipped ? "info" : "warning"),
          title: result.ok ? "Discord publicado" : (skipped ? "Discord ignorado" : "Falha no Discord"),
          message: result.ok
            ? "Oferta publicada no Discord."
            : (result.reason || result.detail || result.error || "Falha ao publicar no Discord."),
          data: { offerId: offer.id, channel: result.channel || "", detail: result.detail || result.reason || "" }
        });
        console.log("agent_event", JSON.stringify({ agent: "publisher", event: "discord_done", offerId: offer.id, ok: result.ok, reason: result.reason || result.detail || "" }));
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

async function safeReport(db, config, event) {
  try {
    await reportAgentEvent(db, config, event);
  } catch {
    // Operational reporting must never block the publishing pipeline.
  }
}

async function blockImageUnverified(db, config, offer) {
  const skipped = { ok: true, skipped: true, detail: "image_verification_failed" };
  await safeReport(db, config, {
    agent: "publisher",
    severity: "warning",
    title: "Publicação bloqueada por imagem",
    message: "Oferta Amazon vinda da busca não publicou porque a imagem exata do ASIN não foi verificada.",
    data: { offerId: offer.id, asin: offer.asin || "" }
  });
  return { telegram: skipped, discord: skipped, x: skipped };
}

async function refreshExactAmazonMedia(offer, config, db) {
  if (offer.store !== "amazon" || !offer.asin) return offer;
  if (offer.source && offer.source !== "amazon_search") return offer;
  if (offer.productPageImageVerifiedAt && offer.imageUrls?.length) return offer;
  const verified = await verifyAmazonProduct(offer.asin, config);
  if (!verified.imageUrls?.length) {
    const updates = {
      imageUrl: null,
      imageUrls: [],
      imageVerificationFailed: true,
      imageStatus: "failed",
      imageStatusUpdatedAt: new Date().toISOString()
    };
    const offerInDb = db.state.offers?.find((item) => item.id === offer.id);
    if (offerInDb) Object.assign(offerInDb, updates, { updatedAt: new Date().toISOString() });
    return { ...offer, ...updates };
  }
  const updates = {
    imageUrl: verified.imageUrl,
    imageUrls: verified.imageUrls,
    productPageImageVerifiedAt: new Date().toISOString()
  };
  const offerInDb = db.state.offers?.find((item) => item.id === offer.id);
  if (offerInDb) Object.assign(offerInDb, updates, { updatedAt: new Date().toISOString() });
  return { ...offer, ...updates };
}
