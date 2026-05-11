import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { cloneDraftForRetest, createAnalyticsReport, createDraftsForOffer, publishApprovedX, refreshOfferAffiliateUrls, refreshOfferDecision, regenerateDraftCopy, runPublishPipeline, runScrapePipeline } from "./agents.js";
import { buildDiagnostics } from "./integrations.js";
import { buildAffiliateUrl } from "./links.js";
import { testTelegram } from "./publishers/telegram.js";

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
      await serveStatic(res, publicDir, url.pathname === "/" ? "/index.html" : url.pathname);
    } catch (error) {
      sendJson(res, 500, { error: "internal_error", detail: error.message });
    }
  });
}

async function handleApi(req, res, url, db, config) {
  if (req.method === "GET" && url.pathname === "/api/state") {
    sendJson(res, 200, publicState(db));
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
    sendJson(res, 200, await runScrapePipeline(db, config));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/run/publish") {
    const telegram = await runPublishPipeline(db, config);
    const x = await publishApprovedX(db, config);
    sendJson(res, 200, { telegram, x });
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
    db.state.offers[offerIndex] = refreshOfferDecision({
      ...db.state.offers[offerIndex],
      affiliateUrl: body.affiliateUrl.trim(),
      affiliateReady: true,
      affiliateSource: "manual",
      updatedAt: new Date().toISOString()
    }, db, config);
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

function publicState(db) {
  const clicksByOffer = Object.fromEntries(
    db.state.offers.map((offer) => [offer.id, db.state.clicks.filter((click) => click.offerId === offer.id).length])
  );
  return {
    offers: db.state.offers,
    drafts: db.state.drafts,
    clicks: db.state.clicks,
    reports: db.state.reports,
    settings: db.state.settings,
    publishLog: db.state.publishLog.slice(0, 20),
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
