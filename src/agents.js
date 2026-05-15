import { validatePost, validateXAcquisitionPost } from "./compliance.js";
import { createTelegramCopy, createXPostCopy } from "./copywriter.js";
import { buildAffiliateUrl, createShortCode, hasAffiliateConfig } from "./links.js";
import { dedupeOffers, scoreOfferDetailed, statusForScore } from "./scoring.js";
import { getLastScrapeMeta, scrapeDeals, scrapeFeedDeals } from "./scrapers.js";
import { publishDiscord } from "./publishers/discord.js";
import { publishTelegram } from "./publishers/telegram.js";
import { publishXAcquisition } from "./publishers/x.js";
import { buildRecommendations } from "./recommendations.js";
import { applyValidation } from "./validation.js";

export async function runScrapePipeline(db, config) {
  const [amazonOffers, feedOffers] = await Promise.all([
    scrapeDeals(config),
    scrapeFeedDeals(config)
  ]);
  const rawOffers = [...amazonOffers, ...feedOffers];
  const incoming = dedupeOffers(db.state.offers, rawOffers).map((offer) => {
    const id = db.nextId("offer");
    const scoredOffer = {
      id,
      ...offer,
      affiliateUrl: buildAffiliateUrl(offer, config),
      affiliateReady: hasAffiliateConfig(offer, config),
      score: 0,
      status: "new",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return refreshOfferDecision(scoredOffer, db, config);
  });

  db.state.offers.unshift(...incoming);
  for (const offer of incoming) {
    if (!["archived", "blocked"].includes(offer.status)) {
      createDraftsForOffer(db, offer, config);
      if (config.discordWebhookUrl) createDiscordDraft(db, offer, config);
    }
  }
  await maybeCreateXDraft(db, config);
  await db.save();
  return { found: rawOffers.length, inserted: incoming.length, scrape: getLastScrapeMeta() };
}

export function refreshOfferDecision(offer, db, config) {
  const validatedOffer = applyValidation(offer, config);
  const performance = { clicks: db.state.clicks.filter((click) => click.offerId === validatedOffer.id).length };
  const score = scoreOfferDetailed(validatedOffer, performance);
  validatedOffer.score = score.total;
  validatedOffer.scoreBreakdown = score.components;
  validatedOffer.status = validatedOffer.publishable
    ? statusForScore(validatedOffer.score, db.state.settings)
    : validatedOffer.validationStatus === "blocked"
      ? "blocked"
      : "needs_review";
  return validatedOffer;
}

export function createDraftsForOffer(db, offer, config) {
  const shortCode = createShortCode(db, offer.id, "telegram");
  const text = createTelegramCopy(offer, shortCode, config);
  const compliance = validatePost(text, config.disclosure, offer);
  const hasWarnings = Boolean(compliance.warnings?.length);
  const draft = {
    id: db.nextId("draft"),
    offerId: offer.id,
    channel: "telegram",
    text,
    disclosure: config.disclosure,
    shortCode,
    status: offer.status === "auto_ready" && compliance.ok && !hasWarnings ? "auto_ready" : "needs_review",
    rejectionReason: compliance.ok ? "" : compliance.errors.join(","),
    warnings: compliance.warnings || [],
    publishedAt: null,
    providerMessageId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.state.drafts.unshift(draft);
  return draft;
}

export function createDiscordDraft(db, offer, config) {
  const shortCode = createShortCode(db, offer.id, "discord");
  const text = createTelegramCopy(offer, shortCode, config);
  const compliance = validatePost(text, config.disclosure, offer);
  const draft = {
    id: db.nextId("draft"),
    offerId: offer.id,
    channel: "discord",
    text,
    disclosure: config.disclosure,
    shortCode,
    status: offer.status === "auto_ready" && compliance.ok ? "auto_ready" : "needs_review",
    rejectionReason: compliance.ok ? "" : compliance.errors.join(","),
    warnings: compliance.warnings || [],
    publishedAt: null,
    providerMessageId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.state.drafts.unshift(draft);
  return draft;
}

export function createXDraftForOffer(db, offer, config) {
  const shortCode = createShortCode(db, offer.id, "x");
  const text = createXPostCopy(offer, shortCode, config);
  const compliance = validateXAcquisitionPost(text);
  const draft = {
    id: db.nextId("draft"),
    offerId: offer.id,
    channel: "x",
    text,
    disclosure: "",
    shortCode,
    status: compliance.ok ? "needs_review" : "blocked",
    rejectionReason: compliance.ok ? "" : compliance.errors.join(","),
    publishedAt: null,
    providerMessageId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.state.drafts.unshift(draft);
  return draft;
}

export function regenerateDraftCopy(db, draftId, config) {
  const draft = db.state.drafts.find((item) => item.id === draftId);
  if (!draft) return null;
  if (!["telegram", "x"].includes(draft.channel) || !draft.offerId || draft.publishedAt) return draft;
  const offer = db.state.offers.find((item) => item.id === draft.offerId);
  if (!offer) return draft;
  draft.text = draft.channel === "x" ? createXPostCopy(offer, draft.shortCode, config) : createTelegramCopy(offer, draft.shortCode, config);
  const compliance = draft.channel === "x" ? validateXAcquisitionPost(draft.text) : validatePost(draft.text, config.disclosure, offer);
  draft.status = compliance.ok ? "needs_review" : "blocked";
  draft.rejectionReason = compliance.ok ? "" : compliance.errors.join(",");
  draft.warnings = compliance.warnings || [];
  draft.updatedAt = new Date().toISOString();
  return draft;
}

export function cloneDraftForRetest(db, draftId, config) {
  const source = db.state.drafts.find((item) => item.id === draftId);
  if (!source || !["telegram", "x"].includes(source.channel) || !source.offerId) return null;
  const offer = db.state.offers.find((item) => item.id === source.offerId);
  if (!offer) return null;
  return source.channel === "x" ? createXDraftForOffer(db, offer, config) : createDraftsForOffer(db, offer, config);
}

export function refreshOfferAffiliateUrls(db, config) {
  db.state.offers = db.state.offers.map((offer) => {
    offer.affiliateUrl = buildAffiliateUrl(offer, config);
    offer.affiliateReady = hasAffiliateConfig(offer, config);
    offer.updatedAt = new Date().toISOString();
    return refreshOfferDecision(offer, db, config);
  });
}

export async function maybeCreateXDraft(db, config) {
  const [topOffer] = db.state.offers
    .filter((offer) => !["archived", "blocked"].includes(offer.status))
    .sort((a, b) => b.score - a.score)
    .slice(0, 1);
  if (!topOffer) return null;
  const today = new Date().toISOString().slice(0, 10);
  const exists = db.state.drafts.some((draft) => draft.channel === "x" && draft.createdAt.startsWith(today));
  if (exists) return null;
  return createXDraftForOffer(db, topOffer, config);
}

export async function runPublishPipeline(db, config) {
  if (db.state.settings.mode === "paused") {
    console.log("publish_skipped", JSON.stringify({ reason: "paused" }));
    return { published: 0, failed: 0, dryRun: 0, skipped: 1, results: [{ outcome: "skipped", reason: "paused" }] };
  }
  const autoAllowed = db.state.settings.mode === "limited";
  const eligible = db.state.drafts.filter((draft) => {
    if (draft.publishedAt || draft.status === "published") return false;
    if (!["telegram", "discord"].includes(draft.channel)) return false;
    if (draft.status === "approved") return true;
    return autoAllowed && draft.status === "auto_ready";
  });
  console.log("publish_pipeline", JSON.stringify({
    mode: db.state.settings.mode,
    autoAllowed,
    eligible: eligible.length,
    telegramDryRun: config.telegramDryRun,
    hasBotToken: Boolean(config.telegramBotToken),
    hasChatId: Boolean(config.telegramChatId)
  }));

  let published = 0;
  const results = [];
  for (const draft of eligible) {
    const offerIndex = db.state.offers.findIndex((item) => item.id === draft.offerId);
    const offer = offerIndex === -1 ? null : refreshOfferDecision(db.state.offers[offerIndex], db, config);
    if (offerIndex !== -1) db.state.offers[offerIndex] = offer;
    if (!offer || offer.publishable !== true || offer.validationStatus !== "ready") {
      const detail = {
        draftId: draft.id,
        offerId: draft.offerId,
        channel: draft.channel,
        ok: false,
        dryRun: false,
        providerMessageId: null,
        reason: "offer_not_publishable",
        detail: "offer_not_publishable: validate affiliate and price before publishing.",
        outcome: "skipped"
      };
      results.push(detail);
      draft.lastPublishResult = detail;
      draft.publishAttempts = [...(draft.publishAttempts || []), detail].slice(-10);
      draft.rejectionReason = detail.detail;
      draft.updatedAt = new Date().toISOString();
      continue;
    }
    const result = draft.channel === "discord"
      ? await publishDiscord(draft, config, offer)
      : await publishTelegram(draft, config, offer);
    console.log("telegram_publish_result", JSON.stringify({
      draftId: draft.id,
      ok: result.ok,
      dryRun: result.dryRun,
      detail: result.detail,
      providerMessageId: result.providerMessageId || null
    }));
    db.state.publishLog.unshift({
      id: db.nextId("pub"),
      draftId: draft.id,
      channel: draft.channel,
      result,
      createdAt: new Date().toISOString()
    });
    const detail = {
      draftId: draft.id,
      offerId: draft.offerId,
      channel: draft.channel,
      ok: result.ok,
      dryRun: result.dryRun,
      providerMessageId: result.providerMessageId || null,
      detail: result.detail,
      outcome: result.ok ? "published" : "failed"
    };
    results.push(detail);
    draft.lastPublishResult = detail;
    draft.publishAttempts = [...(draft.publishAttempts || []), detail].slice(-10);
    if (result.ok) {
      draft.status = "published";
      draft.publishedAt = new Date().toISOString();
      draft.providerMessageId = result.providerMessageId;
      draft.updatedAt = new Date().toISOString();
      published += 1;
    } else {
      draft.status = "failed";
      draft.rejectionReason = result.detail;
      draft.updatedAt = new Date().toISOString();
    }
  }
  await db.save();
  return {
    published,
    failed: results.filter((item) => item.outcome === "failed").length,
    dryRun: results.filter((item) => item.dryRun).length,
    skipped: results.filter((item) => item.outcome === "skipped").length,
    results
  };
}

export async function publishApprovedX(db, config) {
  const drafts = db.state.drafts.filter((draft) => draft.channel === "x" && draft.status === "approved" && !draft.publishedAt);
  for (const draft of drafts) {
    const result = await publishXAcquisition(draft.text, config, db.state.publishLog);
    db.state.publishLog.unshift({
      id: db.nextId("pub"),
      draftId: draft.id,
      channel: draft.channel,
      result,
      createdAt: new Date().toISOString()
    });
    if (result.ok) {
      draft.status = "published";
      draft.publishedAt = new Date().toISOString();
    }
  }
  await db.save();
  return { published: drafts.length };
}

export function createAnalyticsReport(db) {
  const clicksByOffer = new Map();
  for (const click of db.state.clicks) {
    clicksByOffer.set(click.offerId, (clicksByOffer.get(click.offerId) || 0) + 1);
  }
  const topOffers = [...clicksByOffer.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([offerId, clicks]) => {
      const offer = db.state.offers.find((item) => item.id === offerId);
      return { offerId, title: offer?.title || "Oferta removida", clicks };
    });

  const conclusions = [];
  if (topOffers.length === 0) conclusions.push("Ainda não há cliques suficientes para otimização estatística.");
  else conclusions.push("Priorizar produtos parecidos com as ofertas mais clicadas.");

  const suggestions = [
    "Manter X como canal de aquisição sem link direto.",
    "Publicar automaticamente somente ofertas com score >= 85.",
    topOffers.length ? "Repetir categorias e faixas de preço das ofertas com mais cliques." : "Divulgar o canal Telegram antes de aumentar volume."
  ];

  const recommendations = buildRecommendations(db.state);
  db.state.recommendations = recommendations;

  const report = {
    id: db.nextId("report"),
    period: new Date().toISOString().slice(0, 10),
    conclusions,
    suggestions,
    recommendations,
    expectedImpact: "Aumentar cliques qualificados reduzindo posts fracos.",
    topOffers,
    createdAt: new Date().toISOString()
  };
  db.state.reports.unshift(report);
  return report;
}
