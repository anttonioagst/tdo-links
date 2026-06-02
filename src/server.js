import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { cloneDraftForRetest, createAnalyticsReport, createDraftsForOffer, publishApprovedX, refreshOfferAffiliateUrls, refreshOfferDecision, regenerateDraftCopy, regenerateDraftsForOffer } from "./agents.js";
import { runAmazonDiscovery, updateAmazonDiscoverySettings } from "./discovery.js";
import { runDiscovery } from "./agents/discovery.js";
import { runSupervisorCheck } from "./agents/supervisor.js";
import { checkDiscordStatus, setupDiscordServer } from "./discord/setup.js";
import { buildDiagnostics } from "./integrations.js";
import { createContent } from "./agents/creative.js";
import { publishDeal } from "./agents/publisher.js";
import { selectImmediatePublishOffer } from "./immediate-publish.js";
import { buildAffiliateUrl } from "./links.js";
import { testDiscord } from "./publishers/discord.js";
import { testTelegram } from "./publishers/telegram.js";
import { enqueueScrape, enqueuePublish, enqueueImagegen } from "./queues/producers.js";
import { buildRecommendations } from "./recommendations.js";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

export function createApp({ db, config, publicDir }) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, config.publicBaseUrl);
      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url, db, config);
        return;
      }
      if (url.pathname.startsWith("/go/")) {
        await handleRedirect(req, res, url, db, config);
        return;
      }
      if (url.pathname === "/links") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(buildLinksPage(db, config));
        return;
      }
      await serveStatic(res, publicDir, url.pathname === "/" ? "/index.html" : url.pathname);
    } catch (error) {
      sendJson(res, 500, { error: "internal_error", detail: error.message });
    }
  });
}

async function handleApi(req, res, url, db, config) {
  if (requiresAdminAuth(req, config) && !hasAdminAuth(req, config)) {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }

  const offerImageServeMatch = url.pathname.match(/^\/api\/offers\/([^/]+)\/image$/);
  if (req.method === "GET" && offerImageServeMatch) {
    const [, offerId] = offerImageServeMatch;
    const offer = db.state.offers.find((item) => item.id === offerId);
    if (!offer?.generatedImagePath) {
      sendJson(res, 404, { error: "no_generated_image" });
      return;
    }
    try {
      const body = await readFile(offer.generatedImagePath);
      res.writeHead(200, { "content-type": "image/jpeg", "cache-control": "public, max-age=3600" });
      res.end(body);
    } catch {
      sendJson(res, 404, { error: "image_file_not_found" });
    }
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/recent-deals") {
    const published = (db.state.publishLog || [])
      .filter(e => e.channel === "telegram" && e.result?.ok === true)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 3)
      .map(e => {
        const offer = (db.state.offers || []).find(o => o.id === e.offerId);
        if (!offer) return null;
        return {
          title: offer.title,
          currentPrice: offer.currentPrice,
          previousPrice: offer.previousPrice,
          discountPercent: offer.discountPercent,
          store: offer.store,
          imageUrl: offer.imageUrl || offer.imageUrls?.[0] || null,
          publishedAt: e.createdAt
        };
      })
      .filter(Boolean);
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ ok: true, deals: published }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/state") {
    sendJson(res, 200, publicState(db, config));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, service: "affiliate-deal-agents-mvp", time: new Date().toISOString() });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/diagnostics") {
    sendJson(res, 200, buildDiagnostics({ config, state: db.state }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/recommendations") {
    const recommendations = buildRecommendations(db.state);
    sendJson(res, 200, recommendations);
    return;
  }
  if (req.method === "PUT" && url.pathname === "/api/discovery/amazon/settings") {
    const body = await readJson(req);
    db.state.discovery.amazon = updateAmazonDiscoverySettings(db.state.discovery?.amazon || {}, body);
    await db.save();
    sendJson(res, 200, db.state.discovery.amazon);
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/discovery/amazon/run") {
    const result = await runAmazonDiscovery(db, config, { trigger: "manual" });
    sendJson(res, 200, result);
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/integrations/telegram/test") {
    const result = await testTelegram(config);
    db.state.publishLog.unshift({
      id: db.nextId("pub"),
      draftId: "",
      channel: "telegram",
      result,
      createdAt: new Date().toISOString()
    });
    await db.save();
    sendJson(res, 200, result);
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/integrations/discord/test") {
    const result = await testDiscord(config);
    db.state.integrations.discord.lastTest = new Date().toISOString();
    if (!result.ok) db.state.integrations.discord.lastError = result.detail;
    await db.save();
    sendJson(res, 200, result);
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/discord/setup") {
    const result = await setupDiscordServer(db, config);
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/discord/status") {
    const result = await checkDiscordStatus(db, config);
    sendJson(res, 200, result);
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/supervisor/run") {
    const { creativeQueue } = await import("./queues/index.js");
    const result = await runSupervisorCheck(db, config, { creativeQueue });
    sendJson(res, 200, result);
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/supervisor/incidents") {
    sendJson(res, 200, { incidents: db.state.incidents || [] });
    return;
  }
  if (req.method === "PUT" && url.pathname === "/api/integrations/discord/settings") {
    const body = await readJson(req);
    db.state.integrations.discord = {
      ...db.state.integrations.discord,
      webhookUrl: body.webhookUrl ?? db.state.integrations.discord.webhookUrl,
      enabled: body.enabled ?? db.state.integrations.discord.enabled,
      dryRun: body.dryRun ?? db.state.integrations.discord.dryRun
    };
    await db.save();
    sendJson(res, 200, db.state.integrations.discord);
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/offers/manual") {
    const body = await readJson(req);
    const originalUrl = String(body.url || "").trim();
    if (!/^https:\/\/(www\.)?amazon\.com\.br\//.test(originalUrl)) {
      sendJson(res, 400, { error: "invalid_amazon_url" });
      return;
    }
    const asin = extractAmazonAsin(originalUrl);
    if (!asin) {
      sendJson(res, 400, { error: "asin_not_found" });
      return;
    }
    if (body.affiliateUrl && !isValidAffiliateUrl(body.affiliateUrl)) {
      sendJson(res, 400, { error: "invalid_affiliate_url" });
      return;
    }
    if (db.state.offers.some((offer) => isSameAmazonOffer(offer, originalUrl, asin))) {
      sendJson(res, 409, { error: "offer_already_exists" });
      return;
    }
    const id = db.nextId("offer");
    const baseOffer = {
      id,
      store: "amazon",
      source: "manual",
      sourceConfidence: 1,
      sourceWarnings: [],
      asin,
      title: String(body.title || `Amazon ${asin || "manual"}`).trim(),
      currentPrice: Number(body.currentPrice || 0),
      previousPrice: body.previousPrice ? Number(body.previousPrice) : null,
      discountPercent: 0,
      originalUrl,
      affiliateUrl: String(body.affiliateUrl || originalUrl).trim(),
      affiliateSource: body.affiliateUrl ? "manual" : "",
      affiliateReady: Boolean(body.affiliateUrl),
      imageUrl: String(body.imageUrl || ""),
      imageUrls: body.imageUrl ? [String(body.imageUrl)] : [],
      category: String(body.category || "tech"),
      rating: Number(body.rating || 0),
      reviewCount: Number(body.reviewCount || 0),
      inStock: body.inStock !== false,
      storeReputation: "high",
      scrapedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    baseOffer.discountPercent = baseOffer.previousPrice && baseOffer.previousPrice > baseOffer.currentPrice
      ? Math.round(((baseOffer.previousPrice - baseOffer.currentPrice) / baseOffer.previousPrice) * 100)
      : 0;
    const validated = refreshOfferDecision(baseOffer, db, config);
    db.state.offers.unshift(validated);
    if (validated.status !== "archived" && validated.status !== "blocked") createDraftsForOffer(db, validated, config);
    await db.save();
    sendJson(res, 200, validated);
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/run/scrape") {
    // Use autonomous discovery pipeline when Anthropic API key is configured
    if (config.anthropicApiKey) {
      try {
        const result = await runDiscovery(db, config);
        sendJson(res, 200, { title: `${result.found} deal(s) encontrado(s), ${result.enqueued} enfileirado(s)`, tone: result.enqueued > 0 ? "success" : "warning", ...result });
      } catch (err) {
        console.error("discovery_error", JSON.stringify({ error: err.message }));
        sendJson(res, 500, { error: "discovery_failed", detail: err.message });
      }
    } else {
      sendJson(res, 200, await enqueueScrape(db, config, "manual"));
    }
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/debug/test-pipeline") {
    const { validationQueue } = await import("./queues/index.js");
    if (!validationQueue) {
      sendJson(res, 503, { error: "validation_queue_not_available", detail: "Redis not connected" });
      return;
    }
    const ts = Date.now();
    const testOffer = {
      title: `Fone de Ouvido Sony WH-1000XM5 Noise Cancelling Bluetooth (test-${ts})`,
      currentPrice: 1499.00,
      previousPrice: 2199.00,
      discountPercent: 32,
      originalUrl: "https://www.amazon.com.br/dp/B09XS7JWHH",
      asin: "B09XS7JWHH",
      imageUrl: "https://m.media-amazon.com/images/I/61IcNpBaEEL._AC_SX679_.jpg",
      imageUrls: ["https://m.media-amazon.com/images/I/61IcNpBaEEL._AC_SX679_.jpg"],
      store: "amazon",
      category: "headset",
      rating: 4.7,
      reviewCount: 4210,
      inStock: true,
      source: "debug_inject",
      sourceConfidence: 0.95,
      sourceWarnings: [],
      scrapedAt: new Date().toISOString()
    };
    await validationQueue.add("validate", { offer: testOffer }, { attempts: 2 });
    console.log("debug_test_pipeline", JSON.stringify({ title: testOffer.title }));
    sendJson(res, 200, { ok: true, offer: testOffer, detail: "Offer enqueued to validation — watch Pipeline view" });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/debug/publish-log") {
    const rows = db.pool
      ? (await db.pool.query("SELECT id, offer_id, channel, result, created_at FROM publish_log ORDER BY created_at DESC LIMIT 20")).rows
      : (db.state.publishLog || []).slice(0, 20);
    sendJson(res, 200, { source: db.pool ? "postgres" : "json", count: rows.length, rows });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/debug/clear-rejected") {
    let removed = 0;
    if (db.pool) {
      const delRes = await db.pool.query("DELETE FROM offers WHERE status IN ('rejected', 'queued')");
      removed = delRes.rowCount ?? 0;
    }
    db.state.offers = db.state.offers.filter(o => o.status !== "rejected" && o.status !== "queued");
    if (!db.pool) await db.save();
    console.log("debug_clear_rejected", JSON.stringify({ removed, remaining: db.state.offers.length }));
    sendJson(res, 200, { ok: true, removed, remaining: db.state.offers.length });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/debug/clear-quota") {
    const { creativeQueue, publishQueue, validationQueue, scrapeQueue, imagegenQueue } = await import("./queues/index.js");
    const windowHours = config.publicationWindowHours ?? 1;
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
    // Delete directly from PostgreSQL — batchInsertIgnore never deletes rows
    let removed = 0;
    if (db.pool) {
      const result = await db.pool.query("DELETE FROM publish_log WHERE created_at >= $1", [windowStart]);
      removed = result.rowCount ?? 0;
    } else {
      const before = (db.state.publishLog || []).length;
      db.state.publishLog = (db.state.publishLog || []).filter(l => l.createdAt < windowStart);
      removed = before - db.state.publishLog.length;
      await db.save();
    }
    // Sync in-memory state
    await db.load();
    // Drain BullMQ queues to prevent backlog
    const drained = {};
    if (scrapeQueue) { await scrapeQueue.drain(); drained.scrape = true; }
    if (imagegenQueue) { await imagegenQueue.drain(); drained.imagegen = true; }
    if (validationQueue) { await validationQueue.drain(); drained.validation = true; }
    if (creativeQueue) { await creativeQueue.drain(); drained.creative = true; }
    if (publishQueue) { await publishQueue.drain(); drained.publish = true; }
    console.log("debug_clear_quota", JSON.stringify({ removed, remaining: (db.state.publishLog || []).length, drained }));
    sendJson(res, 200, { ok: true, removed, remaining: (db.state.publishLog || []).length, drained });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/run/publish") {
    const result = await enqueuePublish(db, config, null, ["telegram", "twitter"]);
    if (!result.queued) {
      const x = await publishApprovedX(db, config);
      sendJson(res, 200, { ...result, x });
    } else {
      sendJson(res, 200, result);
    }
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/run/publish-now") {
    if (db.load) await db.load();
    const body = await readJson(req).catch(() => ({}));
    const offer = selectImmediatePublishOffer(db.state, config, { offerId: body.offerId });
    if (!offer) {
      sendJson(res, 200, { ok: false, skipped: true, reason: "no_eligible_auto_ready_offer" });
      return;
    }
    const content = await createContent(offer, {
      valid: true,
      confidence: offer.validationConfidence || 90,
      reason: offer.validationSummary || "Oferta auto_ready selecionada para teste operacional."
    }, config);
    const offerInDb = db.state.offers.find((item) => item.id === offer.id);
    if (offerInDb && content.imageUrls?.length) {
      offerInDb.officialImageUrls = content.imageUrls;
      offerInDb.imageStatus = "done";
      offerInDb.imageStatusUpdatedAt = new Date().toISOString();
      offerInDb.updatedAt = new Date().toISOString();
      await db.save();
    }
    const result = await publishDeal(offerInDb || offer, content, config, db);
    sendJson(res, 200, { ok: true, offerId: offer.id, title: offer.title, result });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/run/report") {
    const report = createAnalyticsReport(db);
    await db.save();
    sendJson(res, 200, report);
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/run/refresh-affiliates") {
    refreshOfferAffiliateUrls(db, config);
    await db.save();
    sendJson(res, 200, { refreshed: db.state.offers.length });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/settings") {
    const body = await readJson(req);
    db.state.settings = { ...db.state.settings, ...body };
    await db.save();
    sendJson(res, 200, db.state.settings);
    return;
  }
  const offerImageMatch = url.pathname.match(/^\/api\/offers\/([^/]+)\/generate-image$/);
  if (req.method === "POST" && offerImageMatch) {
    const [, offerId] = offerImageMatch;
    const offerIndex = db.state.offers.findIndex((item) => item.id === offerId);
    if (offerIndex === -1) {
      sendJson(res, 404, { error: "offer_not_found" });
      return;
    }
    try {
      const result = await enqueueImagegen(db, config, offerId);
      sendJson(res, 200, result);
    } catch (err) {
      console.error("generate_image_error", JSON.stringify({ offerId, error: err.message }));
      sendJson(res, 500, { error: err.message });
    }
    return;
  }
  const offerAffiliateMatch = url.pathname.match(/^\/api\/offers\/([^/]+)\/affiliate$/);
  if (req.method === "POST" && offerAffiliateMatch) {
    const [, offerId] = offerAffiliateMatch;
    const body = await readJson(req);
    const offerIndex = db.state.offers.findIndex((item) => item.id === offerId);
    if (offerIndex === -1) {
      sendJson(res, 404, { error: "offer_not_found" });
      return;
    }
    if (!isValidAffiliateUrl(body.affiliateUrl)) {
      sendJson(res, 400, { error: "invalid_affiliate_url" });
      return;
    }
    if (body.currentPrice !== undefined) {
      if (!db.state.priceHistory[offerId]) db.state.priceHistory[offerId] = [];
      db.state.priceHistory[offerId].unshift({ price: body.currentPrice, timestamp: new Date().toISOString() });
      db.state.priceHistory[offerId] = db.state.priceHistory[offerId].slice(0, 10);
    }
    db.state.offers[offerIndex] = refreshOfferDecision({
      ...db.state.offers[offerIndex],
      affiliateUrl: body.affiliateUrl.trim(),
      affiliateReady: true,
      affiliateSource: "manual",
      updatedAt: new Date().toISOString()
    }, db, config);
    regenerateDraftsForOffer(db, offerId, config);
    await db.save();
    sendJson(res, 200, db.state.offers[offerIndex]);
    return;
  }
  const offerValidateMatch = url.pathname.match(/^\/api\/offers\/([^/]+)\/validate$/);
  if (req.method === "POST" && offerValidateMatch) {
    const [, offerId] = offerValidateMatch;
    const offerIndex = db.state.offers.findIndex((item) => item.id === offerId);
    if (offerIndex === -1) {
      sendJson(res, 404, { error: "offer_not_found" });
      return;
    }
    db.state.offers[offerIndex] = refreshOfferDecision(db.state.offers[offerIndex], db, config);
    await db.save();
    sendJson(res, 200, db.state.offers[offerIndex]);
    return;
  }
  const draftMatch = url.pathname.match(/^\/api\/drafts\/([^/]+)\/(approve|reject|edit|regenerate|clone)$/);
  if (req.method === "POST" && draftMatch) {
    const [, draftId, action] = draftMatch;
    const body = await readJson(req);
    const draft = db.state.drafts.find((item) => item.id === draftId);
    if (!draft) {
      sendJson(res, 404, { error: "draft_not_found" });
      return;
    }
    if (action === "approve") draft.status = "approved";
    if (action === "reject") {
      draft.status = "rejected";
      draft.rejectionReason = body.reason || "Rejeitado manualmente.";
    }
    if (action === "edit") {
      draft.text = body.text || draft.text;
      draft.status = "needs_review";
    }
    if (action === "regenerate") {
      regenerateDraftCopy(db, draftId, config);
    }
    if (action === "clone") {
      const cloned = cloneDraftForRetest(db, draftId, config);
      await db.save();
      sendJson(res, cloned ? 200 : 400, cloned || { error: "draft_not_cloneable" });
      return;
    }
    draft.updatedAt = new Date().toISOString();
    await db.save();
    sendJson(res, 200, draft);
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/drafts/regenerate-pending") {
    if (!hasAdminAuth(req, config)) { sendJson(res, 401, { error: "unauthorized" }); return; }
    const pending = db.state.drafts.filter(d => !d.publishedAt && d.channel === "telegram");
    for (const d of pending) regenerateDraftCopy(db, d.id, config);
    await db.save();
    sendJson(res, 200, { regenerated: pending.length });
    return;
  }
  sendJson(res, 404, { error: "not_found" });
}

async function handleRedirect(req, res, url, db, config) {
  if (url.pathname.startsWith("/go/offer/")) {
    const offerId = decodeURIComponent(url.pathname.replace("/go/offer/", ""));
    const offer = db.state.offers.find((item) => item.id === offerId);
    if (!offer) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Oferta nao encontrada.");
      return;
    }
    db.state.clicks.unshift({
      id: db.nextId("click"),
      shortCode: `offer:${offer.id}`,
      channel: "admin",
      offerId: offer.id,
      timestamp: new Date().toISOString(),
      userAgent: req.headers["user-agent"] || "",
      referer: req.headers.referer || "",
      country: ""
    });
    await db.save();
    res.writeHead(302, { location: buildAffiliateUrl(offer, config, "admin") });
    res.end();
    return;
  }

  const shortCode = decodeURIComponent(url.pathname.replace("/go/", ""));
  const draft = db.state.drafts.find((item) => item.shortCode === shortCode);
  const offer = draft ? db.state.offers.find((item) => item.id === draft.offerId) : null;
  if (!draft || !offer) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Link expirado ou invalido.");
    return;
  }
  db.state.clicks.unshift({
    id: db.nextId("click"),
    shortCode,
    channel: draft.channel,
    offerId: offer.id,
    timestamp: new Date().toISOString(),
    userAgent: req.headers["user-agent"] || "",
    referer: req.headers.referer || "",
    country: ""
  });
  await db.save();
  res.writeHead(302, { location: buildAffiliateUrl(offer, config, draft.channel) });
  res.end();
}

async function serveStatic(res, publicDir, pathname) {
  const safePath = pathname.replace(/^\/+/, "").replace(/\.\./g, "");
  const filePath = join(publicDir, safePath);
  const body = await readFile(filePath);
  res.writeHead(200, { "content-type": mimeTypes[extname(filePath)] || "application/octet-stream" });
  res.end(body);
}

function publicState(db, config) {
  const recommendations = buildRecommendations(db.state);
  const clicksByOffer = Object.fromEntries(
    db.state.offers.map((offer) => [offer.id, db.state.clicks.filter((click) => click.offerId === offer.id).length])
  );
  return {
    offers: db.state.offers,
    drafts: db.state.drafts,
    clicks: db.state.clicks,
    reports: db.state.reports,
    diagnostics: buildDiagnostics({ config, state: db.state }),
    recommendations,
    settings: db.state.settings,
    discovery: db.state.discovery,
    discord: db.state.discord,
    incidents: db.state.incidents || [],
    publishLog: db.state.publishLog.slice(0, 20),
    integrations: db.state.integrations,
    priceHistory: db.state.priceHistory,
    scraperMode: config.scraperMode,
    metrics: {
      offers: db.state.offers.length,
      drafts: db.state.drafts.length,
      clicks: db.state.clicks.length,
      published: db.state.drafts.filter((draft) => draft.status === "published").length,
      clicksByOffer
    }
  };
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function requiresAdminAuth(req, config) {
  return Boolean(config.adminToken) && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
}

function buildLinksPage(db, config) {
  const telegramUrl = config.telegramChannelUrl || "https://t.me/tdolinks";
  const discordUrl = config.discordInviteUrl || "";
  const xUrl = config.xProfileUrl || "";
  const pixelId = config.metaPixelId || "";

  const pixelScript = pixelId ? `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');fbq('track','ViewContent');</script><noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${pixelId}&ev=ViewContent&noscript=1"></noscript>` : "";

  const arrow = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>`;
  const tgIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`;
  const dcIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.034.054a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>`;
  const xIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.749l7.73-8.835L1.254 2.25H8.08l4.261 5.628L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/></svg>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>TDO Links</title>
  <meta name="description" content="Curadoria real de deals de tecnologia premium no Brasil.">
  <link rel="preconnect" href="https://api.fontshare.com" crossorigin>
  <link href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700,900&display=swap" rel="stylesheet">
  <style>
    :root {
      --accent: #EC6227;
      --text: #1e2229;
      --muted: #6a707c;
      --dark: #1f2229;
      --shadow-primary: rgba(236,98,39,0.14) 0 12px 34px 0;
      --shadow-secondary: rgba(20,24,31,0.05) 0 10px 28px 0;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #fff; color: var(--text); font-family: 'Satoshi','Inter',ui-sans-serif,sans-serif; -webkit-font-smoothing: antialiased; min-height: 100svh; }
    .bg { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
    .orb { position: absolute; border-radius: 9999px; }
    .orb-a { width: 360px; height: 360px; left: -96px; top: 40px; background: hsl(28 60% 88%/0.6); filter: blur(110px); animation: da 12s ease-in-out infinite alternate; }
    .orb-b { width: 300px; height: 300px; right: -60px; top: 42%; background: hsl(210 18% 91%/0.75); filter: blur(120px); animation: db 16s ease-in-out infinite alternate; }
    .orb-c { width: 380px; height: 380px; left: 18%; bottom: -120px; background: hsl(32 28% 90%/0.55); filter: blur(130px); animation: dc 14s ease-in-out infinite alternate; }
    @keyframes da { to { transform: translate(24px,16px) scale(1.05); } }
    @keyframes db { to { transform: translate(-18px,22px) scale(0.97); } }
    @keyframes dc { to { transform: translate(12px,-20px) scale(1.03); } }
    .bg-grid { position: absolute; inset: 0; width: 100%; height: 100%; color: var(--text); opacity: 0.035; }
    main { position: relative; z-index: 10; margin: 0 auto; width: 100%; max-width: 540px; padding: 48px 20px 96px; }
    .header { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; }
    .logo-mark { width: 56px; height: 56px; border-radius: 9999px; background: var(--accent); display: flex; align-items: center; justify-content: center; box-shadow: rgba(236,98,39,0.28) 0 4px 20px; }
    .logo-mark svg { width: 28px; height: 28px; }
    .brand-name { font-weight: 700; font-size: clamp(1.2rem,5vw,1.55rem); letter-spacing: -0.03em; color: var(--text); line-height: 1; }
    .brand-name span { color: var(--accent); }
    .ticker-wrap { position: relative; height: 14px; overflow: hidden; width: 100%; margin-top: 2px; }
    .ticker-item { position: absolute; inset-x: 0; top: 0; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 10px; font-weight: 500; color: var(--muted); }
    .ticker-dot { width: 4px; height: 4px; border-radius: 9999px; background: var(--accent); flex-shrink: 0; }
    .ticker-item:nth-child(1) { animation: tick 9s linear infinite; }
    .ticker-item:nth-child(2) { animation: tick 9s linear infinite; animation-delay: -6s; }
    .ticker-item:nth-child(3) { animation: tick 9s linear infinite; animation-delay: -3s; }
    @keyframes tick {
      0%   { transform: translateY(100%); opacity: 0; }
      8%   { transform: translateY(0);    opacity: 1; }
      28%  { transform: translateY(0);    opacity: 1; }
      36%  { transform: translateY(-100%); opacity: 0; }
      100% { transform: translateY(-100%); opacity: 0; }
    }
    .social-row { display: flex; align-items: center; justify-content: center; gap: 0; margin-top: 6px; }
    .social-link { display: inline-flex; align-items: center; justify-content: center; padding: 8px; opacity: 0.7; color: var(--text); text-decoration: none; border-radius: 9999px; transition: opacity 0.2s, transform 0.2s; }
    .social-link:hover { opacity: 1; transform: translateY(-2px); }
    .social-link svg { width: 22px; height: 22px; }
    .cards { margin-top: 28px; display: flex; flex-direction: column; gap: 12px; }
    .banner { position: relative; display: block; border-radius: 16px; overflow: hidden; text-decoration: none; aspect-ratio: 2.04/1; }
    .banner--primary { box-shadow: var(--shadow-primary); }
    .banner--secondary { box-shadow: var(--shadow-secondary); }
    .banner-bg { position: absolute; inset: 0; }
    .banner-bg--telegram { background: linear-gradient(135deg, #1a1f2e 0%, #EC6227 100%); }
    .banner-bg--discord  { background: linear-gradient(135deg, #1a1f2e 0%, #5865f2 100%); }
    .banner-icon-bg { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-60%); opacity: 0.12; color: #fff; }
    .banner-icon-bg svg { width: 80px; height: 80px; }
    .banner-fade { position: absolute; inset-x: 0; bottom: 0; height: 45%; background: linear-gradient(transparent, rgba(0,0,0,0.28)); pointer-events: none; }
    .banner-footer { position: absolute; inset-x: 0; bottom: 0; z-index: 10; display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding: 16px; }
    .banner-label { font-size: 11.5px; font-weight: 500; color: rgba(255,255,255,0.95); text-shadow: 0 1px 4px rgba(0,0,0,0.18); flex: 1; line-height: 1.35; }
    .banner-arrow { width: 36px; height: 36px; border-radius: 9999px; background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.32); backdrop-filter: blur(10px); color: #fff; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: transform 0.5s; }
    .banner:hover .banner-arrow { transform: rotate(45deg); }
    footer { margin-top: 40px; text-align: center; font-size: 10px; color: rgba(30,34,41,0.38); }
  </style>
  ${pixelScript}
</head>
<body>
<div class="bg" aria-hidden="true">
  <div class="orb orb-a"></div><div class="orb orb-b"></div><div class="orb orb-c"></div>
  <svg class="bg-grid" xmlns="http://www.w3.org/2000/svg">
    <defs><pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M40 0H0V40" fill="none" stroke="currentColor" stroke-width="0.5"/>
    </pattern></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
  </svg>
</div>
<main>
  <section class="header">
    <div class="logo-mark">
      <svg viewBox="0 0 24 24" fill="none"><ellipse cx="12" cy="12" rx="10" ry="6.5" stroke="white" stroke-width="1.5"/><circle cx="12" cy="12" r="2.5" fill="white"/></svg>
    </div>
    <h1 class="brand-name">TDO <span>LINKS</span></h1>
    <div class="ticker-wrap" aria-hidden="true">
      <div class="ticker-item"><span class="ticker-dot"></span><span>Curadoria real de tech premium</span></div>
      <div class="ticker-item"><span class="ticker-dot"></span><span>Descontos verificados · Marcas consolidadas</span></div>
      <div class="ticker-item"><span class="ticker-dot"></span><span>Só o que realmente vale comprar</span></div>
    </div>
    <div class="social-row">
      <a href="${telegramUrl}" target="_blank" rel="noopener" aria-label="Telegram" class="social-link" ${pixelId ? `onclick="fbq('track','Lead')"` : ""}>${tgIcon}</a>
      ${discordUrl ? `<a href="${discordUrl}" target="_blank" rel="noopener" aria-label="Discord" class="social-link">${dcIcon}</a>` : ""}
      ${xUrl ? `<a href="${xUrl}" target="_blank" rel="noopener" aria-label="X" class="social-link">${xIcon}</a>` : ""}
    </div>
  </section>
  <div class="cards">
    <a href="${telegramUrl}" target="_blank" rel="noopener" class="banner banner--primary" ${pixelId ? `onclick="fbq('track','Lead')"` : ""}>
      <div class="banner-bg banner-bg--telegram"></div>
      <div class="banner-icon-bg">${tgIcon}</div>
      <div class="banner-fade"></div>
      <div class="banner-footer">
        <p class="banner-label">Canal do Telegram · Deals em tempo real</p>
        <span class="banner-arrow">${arrow}</span>
      </div>
    </a>
    <a href="${discordUrl || telegramUrl}" target="_blank" rel="noopener" class="banner banner--secondary">
      <div class="banner-bg banner-bg--discord"></div>
      <div class="banner-icon-bg">${dcIcon}</div>
      <div class="banner-fade"></div>
      <div class="banner-footer">
        <p class="banner-label">Comunidade no Discord · Discussão e novidades</p>
        <span class="banner-arrow">${arrow}</span>
      </div>
    </a>
  </div>
  <footer>© TDO Links ${new Date().getFullYear()} · Tô de Olho em tech pra você</footer>
</main>
</body>
</html>`;
}



function hasAdminAuth(req, config) {
  const headerToken = req.headers["x-admin-token"];
  if (headerToken === config.adminToken) return true;
  const authorization = String(req.headers.authorization || "");
  return authorization === `Bearer ${config.adminToken}`;
}

function isValidAffiliateUrl(value) {
  return /^https:\/\/(www\.)?amazon\.com\.br\/|^https:\/\/amzn\.to\//.test(String(value || ""));
}

function extractAmazonAsin(value) {
  return String(value || "").match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1].toUpperCase() || "";
}

function isSameAmazonOffer(offer, originalUrl, asin) {
  return extractAmazonAsin(offer.originalUrl) === asin || canonicalUrl(offer.originalUrl) === canonicalUrl(originalUrl);
}

function canonicalUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return String(value || "").trim();
  }
}
