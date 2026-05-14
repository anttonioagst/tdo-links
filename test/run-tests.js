import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDraftsForOffer, createAnalyticsReport, runPublishPipeline, runScrapePipeline } from "../src/agents.js";
import { validatePost, validateXAcquisitionPost } from "../src/compliance.js";
import { loadConfig } from "../src/config.js";
import { JsonDb } from "../src/db.js";
import { buildDiagnostics } from "../src/integrations.js";
import { buildAffiliateUrl } from "../src/links.js";
import { testTelegram } from "../src/publishers/telegram.js";
import { buildRecommendations } from "../src/recommendations.js";
import { createApp } from "../src/server.js";
import { dedupeOffers, scoreOffer, scoreOfferDetailed, statusForScore } from "../src/scoring.js";
import { parseAmazonSearch } from "../src/scrapers.js";
import { validateOffer } from "../src/validation.js";
import { buildAmazonSearchUrl, normalizeDiscoverySettings, runAmazonDiscovery } from "../src/discovery.js";
import { shouldRunAmazonDiscovery, runDiscoverySchedulerTick } from "../src/discovery-scheduler.js";
import {
  commandItems,
  densityForView,
  statusTone,
  viewMeta
} from "../client/src/ui/tokens.js";
import {
  channelLabel as uiChannelLabel,
  money as uiMoney,
  statusLabel as uiStatusLabel
} from "../client/src/ui/format.js";

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("scores strong tech deal as automatic", () => {
  const score = scoreOffer({
    discountPercent: 34,
    rating: 4.8,
    reviewCount: 1200,
    inStock: true,
    storeReputation: "high",
    category: "tech",
    currentPrice: 120,
    previousPrice: 190
  });
  assert.equal(statusForScore(score, { autoPublishThreshold: 85, reviewThreshold: 70 }), "auto_ready");
});

test("archives weak or out of stock offers", () => {
  const score = scoreOffer({
    discountPercent: 5,
    rating: 3.5,
    reviewCount: 3,
    inStock: false,
    storeReputation: "low",
    category: "other",
    currentPrice: 400,
    previousPrice: 420
  });
  assert.equal(statusForScore(score, { autoPublishThreshold: 85, reviewThreshold: 70 }), "archived");
});

test("deduplicates by canonical store and path", () => {
  const existing = [{ store: "amazon", originalUrl: "https://www.amazon.com.br/dp/ABC?tag=x" }];
  const incoming = [
    { store: "amazon", originalUrl: "https://www.amazon.com.br/dp/ABC?tag=y" },
    { store: "amazon", originalUrl: "https://www.amazon.com.br/dp/DEF" }
  ];
  assert.equal(dedupeOffers(existing, incoming).length, 1);
});

test("accepts compliant Telegram affiliate copy", () => {
  const disclosure = "Link de afiliado: posso receber comissão pela compra.";
  const result = validatePost(`Oferta tech\nR$ 99,90\nhttps://x.test/go/abc\n${disclosure}`, disclosure);
  assert.equal(result.ok, true);
});

test("blocks posts without disclosure", () => {
  const disclosure = "Link de afiliado: posso receber comissão pela compra.";
  const result = validatePost("Oferta tech\nR$ 99,90\nhttps://x.test/go/abc", disclosure);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("missing_disclosure"));
});

test("accepts X deal copy with price and tracked link", () => {
  const result = validateXAcquisitionPost("🚨 Super Promoção:\nSSD por R$ 99,90\nAd Amazon: https://example.com/go/x1");
  assert.equal(result.ok, true);
});

test("uses Amazon tracking tags per channel", () => {
  const offer = { store: "amazon", originalUrl: "https://www.amazon.com.br/dp/B0TEST1234?ref=x" };
  const config = {
    amazonAffiliateTag: "default-20",
    amazonAffiliateTagTelegram: "telegram-20",
    amazonAffiliateTagAdmin: "admin-20"
  };
  assert.equal(new URL(buildAffiliateUrl(offer, config, "telegram")).searchParams.get("tag"), "telegram-20");
  assert.equal(new URL(buildAffiliateUrl(offer, config, "admin")).searchParams.get("tag"), "admin-20");
  assert.equal(new URL(buildAffiliateUrl(offer, config, "x")).searchParams.get("tag"), "default-20");
});

test("keeps Amazon price posts in review because promo information can expire", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    const config = loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318", AMAZON_AFFILIATE_TAG: "default-20" });
    const draft = createDraftsForOffer(db, {
      id: "offer_test",
      store: "amazon",
      title: "SSD NVMe Teste 1TB",
      currentPrice: 349.9,
      previousPrice: 529.9,
      originalUrl: "https://www.amazon.com.br/dp/B0TEST1234",
      score: 95,
      status: "auto_ready"
    }, config);
    assert.equal(draft.status, "needs_review");
    assert.ok(draft.warnings.includes("amazon_dynamic_price_review"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("saves manual Amazon affiliate links and prioritizes them", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    db.state.offers.push({
      id: "offer_manual",
      store: "amazon",
      title: "Produto Manual",
      originalUrl: "https://www.amazon.com.br/dp/B0TEST1234",
      affiliateUrl: "https://www.amazon.com.br/dp/B0TEST1234?tag=default-20",
      affiliateReady: false
    });
    const config = loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318", AMAZON_AFFILIATE_TAG: "default-20" });
    const app = createApp({ db, config, publicDir: dir });
    const response = await request(app, {
      method: "POST",
      path: "/api/offers/offer_manual/affiliate",
      body: { affiliateUrl: "https://amzn.to/42cFr9f" }
    });
    assert.equal(response.status, 200);
    assert.equal(db.state.offers[0].affiliateSource, "manual");
    assert.equal(buildAffiliateUrl(db.state.offers[0], config, "telegram"), "https://amzn.to/42cFr9f");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("db load includes default Amazon discovery settings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    assert.equal(db.state.discovery.amazon.enabled, true);
    assert.equal(db.state.discovery.amazon.intervalHours, 2);
    assert.equal(db.state.discovery.amazon.minScore, 70);
    assert.equal(db.state.discovery.amazon.maxCandidatesPerRun, 10);
    assert.deepEqual(db.state.discovery.amazon.sourceUrls, []);
    assert.deepEqual(db.state.discovery.amazon.searchTerms, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("normalizes Amazon discovery settings conservatively", () => {
  const settings = normalizeDiscoverySettings({
    enabled: false,
    intervalHours: "0",
    minScore: "101",
    maxCandidatesPerRun: "0",
    sourceUrls: [
      "https://www.amazon.com.br/s?k=ssd",
      "https://example.com/not-amazon",
      "https://www.amazon.com.br/s?k=ssd"
    ],
    searchTerms: ["SSD NVMe", "", " monitor 144hz ", "SSD NVMe"]
  });
  assert.equal(settings.enabled, false);
  assert.equal(settings.intervalHours, 1);
  assert.equal(settings.minScore, 100);
  assert.equal(settings.maxCandidatesPerRun, 1);
  assert.deepEqual(settings.sourceUrls, ["https://www.amazon.com.br/s?k=ssd"]);
  assert.deepEqual(settings.searchTerms, ["SSD NVMe", "monitor 144hz"]);
});

test("builds Amazon search URLs for configured terms", () => {
  assert.equal(
    buildAmazonSearchUrl("SSD NVMe 1TB"),
    "https://www.amazon.com.br/s?k=SSD+NVMe+1TB"
  );
});

test("manual Amazon discovery inserts blocked high-score candidates only", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    db.state.discovery.amazon = normalizeDiscoverySettings({
      sourceUrls: ["https://www.amazon.com.br/s?k=ssd"],
      searchTerms: ["monitor gamer"],
      minScore: 70,
      maxCandidatesPerRun: 10
    });
    const config = loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318" });
    const result = await runAmazonDiscovery(db, config, {
      trigger: "manual",
      fetchCandidates: async (source) => [{
        store: "amazon",
        title: source.type === "term" ? "Monitor Gamer 144hz" : "SSD NVMe 1TB Gen4",
        currentPrice: 349.9,
        previousPrice: 529.9,
        originalUrl: source.type === "term"
          ? "https://www.amazon.com.br/dp/B0MONITOR1X"
          : "https://www.amazon.com.br/dp/B0SSD1TBX1",
        asin: source.type === "term" ? "B0MONITOR1X" : "B0SSD1TBX1",
        sourceConfidence: 0.9,
        sourceWarnings: [],
        category: "tech",
        rating: 4.8,
        reviewCount: 1200,
        inStock: true,
        storeReputation: "high"
      }]
    });
    assert.equal(result.trigger, "manual");
    assert.equal(result.acceptedCount, 2);
    assert.equal(db.state.offers.length, 2);
    assert.equal(db.state.offers[0].source, "amazon_discovery");
    assert.equal(db.state.offers[0].affiliateReady, false);
    assert.equal(db.state.offers[0].publishable, false);
    assert.equal(db.state.offers[0].validationStatus, "blocked");
    assert.ok(db.state.offers[0].validationReasons.includes("amazon_manual_link_required"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Amazon discovery deduplicates existing ASINs and applies score and limit", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    db.state.offers.push({
      id: "existing_offer",
      store: "amazon",
      asin: "B0DUPLICAT",
      originalUrl: "https://www.amazon.com.br/dp/B0DUPLICAT"
    });
    db.state.discovery.amazon = normalizeDiscoverySettings({
      searchTerms: ["tech"],
      minScore: 70,
      maxCandidatesPerRun: 1
    });
    const candidates = [
      {
        store: "amazon",
        title: "Produto Duplicado",
        currentPrice: 349.9,
        previousPrice: 529.9,
        originalUrl: "https://www.amazon.com.br/dp/B0DUPLICAT",
        asin: "B0DUPLICAT",
        sourceConfidence: 0.9,
        category: "tech",
        rating: 4.8,
        reviewCount: 1200,
        inStock: true,
        storeReputation: "high"
      },
      {
        store: "amazon",
        title: "Produto Forte",
        currentPrice: 349.9,
        previousPrice: 529.9,
        originalUrl: "https://www.amazon.com.br/dp/B0STRONG01",
        asin: "B0STRONG01",
        sourceConfidence: 0.9,
        category: "tech",
        rating: 4.8,
        reviewCount: 1200,
        inStock: true,
        storeReputation: "high"
      },
      {
        store: "amazon",
        title: "Produto Fraco",
        currentPrice: 999.9,
        previousPrice: null,
        originalUrl: "https://www.amazon.com.br/dp/B0WEAK001X",
        asin: "B0WEAK001X",
        sourceConfidence: 0.2,
        category: "other",
        rating: 3.8,
        reviewCount: 3,
        inStock: true,
        storeReputation: "high"
      }
    ];
    const result = await runAmazonDiscovery(db, loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318" }), {
      trigger: "manual",
      fetchCandidates: async () => candidates
    });
    assert.equal(result.duplicateCount, 1);
    assert.equal(result.rejectedLowScoreCount, 1);
    assert.equal(result.acceptedCount, 1);
    assert.equal(db.state.offers.length, 2);
    assert.equal(db.state.offers[0].asin, "B0STRONG01");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Amazon discovery records healthy no-op when no sources are configured", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    const result = await runAmazonDiscovery(db, loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318" }), { trigger: "manual" });
    assert.equal(result.ok, true);
    assert.equal(result.reason, "no_sources_configured");
    assert.equal(result.acceptedCount, 0);
    assert.equal(db.state.discovery.amazon.lastRun.reason, "no_sources_configured");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("discovery settings API persists dashboard configuration", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    const config = loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318" });
    const app = createApp({ db, config, publicDir: dir });
    const response = await request(app, {
      method: "PUT",
      path: "/api/discovery/amazon/settings",
      body: {
        enabled: false,
        intervalHours: 3,
        minScore: 72,
        maxCandidatesPerRun: 7,
        sourceUrls: ["https://www.amazon.com.br/s?k=ssd"],
        searchTerms: ["monitor gamer"]
      }
    });
    assert.equal(response.status, 200);
    const payload = JSON.parse(response.text);
    assert.equal(payload.enabled, false);
    assert.equal(db.state.discovery.amazon.intervalHours, 3);
    assert.deepEqual(db.state.discovery.amazon.searchTerms, ["monitor gamer"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("discovery run API returns summary and updates state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    const config = loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318" });
    const app = createApp({ db, config, publicDir: dir });
    const response = await request(app, {
      method: "POST",
      path: "/api/discovery/amazon/run"
    });
    assert.equal(response.status, 200);
    const payload = JSON.parse(response.text);
    assert.equal(payload.ok, true);
    assert.equal(payload.reason, "no_sources_configured");
    assert.equal(db.state.discovery.amazon.lastRun.reason, "no_sources_configured");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("state API includes discovery settings and run status", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    db.state.discovery.amazon.lastRun = { id: "disc_1", ok: true, acceptedCount: 0 };
    const app = createApp({ db, config: loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318" }), publicDir: dir });
    const response = await request(app, { method: "GET", path: "/api/state" });
    assert.equal(response.status, 200);
    const payload = JSON.parse(response.text);
    assert.equal(payload.discovery.amazon.intervalHours, 2);
    assert.equal(payload.discovery.amazon.lastRun.id, "disc_1");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("discovery scheduler skips disabled or future runs", () => {
  const now = new Date("2026-05-12T10:00:00.000Z");
  assert.equal(shouldRunAmazonDiscovery({ enabled: false }, now), false);
  assert.equal(shouldRunAmazonDiscovery({ enabled: true, nextRunAt: "2026-05-12T11:00:00.000Z" }, now), false);
  assert.equal(shouldRunAmazonDiscovery({ enabled: true, nextRunAt: "2026-05-12T09:00:00.000Z" }, now), true);
  assert.equal(shouldRunAmazonDiscovery({ enabled: true, nextRunAt: null }, now), true);
});

test("discovery scheduler tick runs when due", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    db.state.discovery.amazon.nextRunAt = "2026-05-12T09:00:00.000Z";
    let called = 0;
    const result = await runDiscoverySchedulerTick(db, loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318" }), {
      now: new Date("2026-05-12T10:00:00.000Z"),
      runDiscovery: async () => {
        called += 1;
        return { ok: true, trigger: "scheduled", acceptedCount: 0 };
      }
    });
    assert.equal(called, 1);
    assert.equal(result.ran, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("scrape to draft to publish dry-run pipeline", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    const config = loadConfig({
      PORT: "4318",
      PUBLIC_BASE_URL: "http://localhost:4318",
      AMAZON_AFFILIATE_TAG: "default-20",
      MERCADO_LIVRE_AFFILIATE_PARAM: "matt_tool=123",
      TELEGRAM_DRY_RUN: "true",
      X_DRY_RUN: "true"
    });
    const scrape = await runScrapePipeline(db, config);
    assert.equal(scrape.inserted, 3);
    assert.ok(db.state.drafts.some((draft) => draft.channel === "telegram"));
    const draft = db.state.drafts.find((item) => item.channel === "telegram");
    draft.status = "approved";
    const offer = db.state.offers.find((item) => item.id === draft.offerId);
    offer.publishable = true;
    offer.validationStatus = "ready";
    offer.scrapedAt = new Date().toISOString();
    offer.source = "manual";
    offer.sourceWarnings = [];

    const publish = await runPublishPipeline(db, config);
    assert.ok(publish.published >= 1);
    assert.ok(db.state.drafts.some((draft) => draft.status === "published"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("scrape pipeline reports mock fallback source explicitly", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    const config = loadConfig({
      PUBLIC_BASE_URL: "http://localhost:4318",
      SCRAPER_MODE: "mock",
      AMAZON_AFFILIATE_TAG: "default-20"
    });
    const result = await runScrapePipeline(db, config);
    assert.equal(result.scrape.source, "mock");
    assert.equal(db.state.offers[0].source, "mock");
    assert.ok(db.state.offers[0].sourceWarnings.includes("mock_source"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("manual offer API creates Amazon offer from pasted URL", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    const config = loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318" });
    const app = createApp({ db, config, publicDir: dir });
    const response = await request(app, {
      method: "POST",
      path: "/api/offers/manual",
      body: {
        url: "https://www.amazon.com.br/dp/B0TEST1234",
        title: "SSD NVMe Manual",
        currentPrice: 349.9,
        affiliateUrl: "https://amzn.to/42cFr9f"
      }
    });
    assert.equal(response.status, 200);
    assert.equal(db.state.offers[0].source, "manual");
    assert.equal(db.state.offers[0].asin, "B0TEST1234");
    assert.equal(db.state.offers[0].affiliateReady, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("manual offer API rejects invalid manual affiliate URL without inserting offer", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    const config = loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318" });
    const app = createApp({ db, config, publicDir: dir });
    const response = await request(app, {
      method: "POST",
      path: "/api/offers/manual",
      body: {
        url: "https://www.amazon.com.br/dp/B0TEST1234",
        title: "SSD NVMe Manual",
        currentPrice: 349.9,
        affiliateUrl: "https://example.com/not-amazon"
      }
    });
    assert.equal(response.status, 400);
    assert.deepEqual(JSON.parse(response.text), { error: "invalid_affiliate_url" });
    assert.equal(db.state.offers.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("manual offer API rejects duplicate Amazon offer URL", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    const config = loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318" });
    const app = createApp({ db, config, publicDir: dir });
    const body = {
      url: "https://www.amazon.com.br/dp/B0TEST1234",
      title: "SSD NVMe Manual",
      currentPrice: 349.9,
      affiliateUrl: "https://amzn.to/42cFr9f"
    };
    const first = await request(app, { method: "POST", path: "/api/offers/manual", body });
    const second = await request(app, { method: "POST", path: "/api/offers/manual", body });
    assert.equal(first.status, 200);
    assert.equal(second.status, 409);
    assert.deepEqual(JSON.parse(second.text), { error: "offer_already_exists" });
    assert.equal(db.state.offers.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("manual offer API rejects Amazon URL without ASIN", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    const config = loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318" });
    const app = createApp({ db, config, publicDir: dir });
    const response = await request(app, {
      method: "POST",
      path: "/api/offers/manual",
      body: {
        url: "https://www.amazon.com.br/s?k=ssd",
        title: "SSD NVMe Manual",
        currentPrice: 349.9,
        affiliateUrl: "https://amzn.to/42cFr9f"
      }
    });
    assert.equal(response.status, 400);
    assert.deepEqual(JSON.parse(response.text), { error: "asin_not_found" });
    assert.equal(db.state.offers.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("parses Amazon search HTML into normalized offer candidates", () => {
  const html = `
    <div data-asin="B0TEST1234">
      <h2><span>SSD NVMe Teste 1TB</span></h2>
      <span class="a-price-whole">349</span><span class="a-price-decimal">,</span><span class="a-price-fraction">90</span>
      <span class="a-price a-text-price"><span>R$ 529,90</span></span>
      <img src="https://m.media-amazon.com/images/I/test.jpg" />
      4,7 de 5 estrelas
      <span class="a-size-base">1.234</span>
    </div>
  `;
  const [offer] = parseAmazonSearch(html);
  assert.equal(offer.store, "amazon");
  assert.equal(offer.title, "SSD NVMe Teste 1TB");
  assert.equal(offer.currentPrice, 349.9);
  assert.equal(offer.previousPrice, 529.9);
  assert.equal(offer.imageUrl, "https://m.media-amazon.com/images/I/test.jpg");
  assert.deepEqual(offer.imageUrls, ["https://m.media-amazon.com/images/I/test.jpg"]);
  assert.equal(offer.originalUrl, "https://www.amazon.com.br/dp/B0TEST1234");
});

test("diagnostics exposes Telegram dry-run and credential health", () => {
  const config = loadConfig({
    PUBLIC_BASE_URL: "http://localhost:4318",
    TELEGRAM_DRY_RUN: "true",
    TELEGRAM_BOT_TOKEN: "",
    TELEGRAM_CHAT_ID: ""
  });
  const diagnostics = buildDiagnostics({
    config,
    state: { publishLog: [] }
  });
  assert.equal(diagnostics.telegram.dryRun, true);
  assert.equal(diagnostics.telegram.ready, false);
  assert.deepEqual(diagnostics.telegram.missing, ["bot_token", "chat_id"]);
});

test("publish pipeline returns per-draft dry-run details", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    const config = loadConfig({
      PORT: "4318",
      PUBLIC_BASE_URL: "http://localhost:4318",
      TELEGRAM_DRY_RUN: "true",
      AMAZON_AFFILIATE_TAG: "default-20",
      MERCADO_LIVRE_AFFILIATE_PARAM: "matt_tool=123",
      X_DRY_RUN: "true"
    });
    await runScrapePipeline(db, config);
    const draft = db.state.drafts.find((item) => item.channel === "telegram");
    draft.status = "approved";
    const offer = db.state.offers.find((item) => item.id === draft.offerId);
    offer.publishable = true;
    offer.validationStatus = "ready";
    offer.scrapedAt = new Date().toISOString();
    offer.source = "manual";
    offer.sourceWarnings = [];
    const publish = await runPublishPipeline(db, config);
    assert.ok(Array.isArray(publish.results));
    assert.ok(publish.results.length >= 1);
    assert.equal(publish.results[0].dryRun, true);
    assert.equal(publish.results[0].channel, "telegram");
    assert.ok(["published", "failed", "skipped"].includes(publish.results[0].outcome));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("publish pipeline refreshes stale offer validation before publishing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    const config = loadConfig({
      PUBLIC_BASE_URL: "http://localhost:4318",
      TELEGRAM_DRY_RUN: "true"
    });
    db.state.offers.push({
      id: "offer_stale_publish",
      store: "amazon",
      title: "Produto com preco antigo",
      originalUrl: "https://www.amazon.com.br/dp/B0STALE123",
      affiliateUrl: "https://amzn.to/42cFr9f",
      affiliateSource: "manual",
      affiliateReady: true,
      currentPrice: 349.9,
      scrapedAt: new Date(Date.now() - 25 * 3_600_000).toISOString(),
      inStock: true,
      validationStatus: "ready",
      publishable: true
    });
    db.state.drafts.push({
      id: "draft_stale_publish",
      offerId: "offer_stale_publish",
      channel: "telegram",
      text: "Oferta teste\nhttps://x.test/go/abc",
      status: "approved",
      publishedAt: null,
      providerMessageId: null
    });
    const publish = await runPublishPipeline(db, config);
    assert.equal(publish.published, 0);
    assert.equal(publish.skipped, 1);
    assert.equal(publish.results[0].outcome, "skipped");
    assert.notEqual(db.state.drafts[0].status, "published");
    assert.equal(db.state.offers[0].validationStatus, "needs_review");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("publish pipeline fails when Telegram credentials are missing outside dry-run", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    const config = loadConfig({
      PUBLIC_BASE_URL: "http://localhost:4318",
      TELEGRAM_DRY_RUN: "false"
    });
    db.state.offers.push({
      id: "offer_missing_telegram_credentials",
      store: "amazon",
      title: "Produto Teste",
      originalUrl: "https://www.amazon.com.br/dp/B0TEST1234",
      affiliateUrl: "https://amzn.to/42cFr9f",
      affiliateSource: "manual",
      affiliateReady: true,
      currentPrice: 349.9,
      scrapedAt: new Date().toISOString(),
      inStock: true,
      publishable: true,
      validationStatus: "ready"
    });
    db.state.drafts.push({
      id: "draft_missing_telegram_credentials",
      offerId: "offer_missing_telegram_credentials",
      channel: "telegram",
      text: "Oferta teste\nhttps://x.test/go/abc",
      status: "approved",
      publishedAt: null,
      providerMessageId: null
    });
    const publish = await runPublishPipeline(db, config);
    assert.equal(publish.published, 0);
    assert.equal(publish.failed, 1);
    assert.equal(publish.results[0].outcome, "failed");
    assert.equal(publish.results[0].dryRun, false);
    assert.match(publish.results[0].detail, /credentials missing/i);
    assert.notEqual(db.state.drafts[0].status, "published");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Telegram integration test normalizes provider network failures", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("network unreachable");
  };
  try {
    const config = loadConfig({
      PUBLIC_BASE_URL: "http://localhost:4318",
      TELEGRAM_DRY_RUN: "false",
      TELEGRAM_BOT_TOKEN: "token",
      TELEGRAM_CHAT_ID: "chat"
    });
    const result = await testTelegram(config);
    assert.equal(result.ok, false);
    assert.equal(result.dryRun, false);
    assert.equal(result.providerMessageId, null);
    assert.match(result.detail, /network unreachable/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("mutating API routes reject missing admin token when configured", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    const config = loadConfig({
      PUBLIC_BASE_URL: "http://localhost:4318",
      ADMIN_TOKEN: "secret"
    });
    const app = createApp({ db, config, publicDir: dir });
    const response = await request(app, {
      method: "POST",
      path: "/api/run/scrape"
    });
    assert.equal(response.status, 401);
    assert.deepEqual(JSON.parse(response.text), { error: "unauthorized" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("mutating API routes accept x-admin-token when configured", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    const config = loadConfig({
      PUBLIC_BASE_URL: "http://localhost:4318",
      ADMIN_TOKEN: "secret",
      AMAZON_AFFILIATE_TAG: "default-20"
    });
    const app = createApp({ db, config, publicDir: dir });
    const response = await request(app, {
      method: "POST",
      path: "/api/run/scrape",
      headers: { "x-admin-token": "secret" }
    });
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(response.text).inserted, 3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("validation blocks Amazon offer without affiliate configuration", () => {
  const config = loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318" });
  const offer = {
    store: "amazon",
    title: "SSD NVMe",
    currentPrice: 349.9,
    originalUrl: "https://www.amazon.com.br/dp/B0TEST1234",
    scrapedAt: new Date().toISOString(),
    inStock: true
  };
  const result = validateOffer(offer, config);
  assert.equal(result.validationStatus, "blocked");
  assert.equal(result.publishable, false);
  assert.ok(result.validationReasons.includes("affiliate_not_ready"));
});

test("validation marks official manual Amazon link as ready", () => {
  const config = loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318" });
  const offer = {
    store: "amazon",
    title: "SSD NVMe",
    currentPrice: 349.9,
    originalUrl: "https://www.amazon.com.br/dp/B0TEST1234",
    affiliateUrl: "https://amzn.to/42cFr9f",
    affiliateSource: "manual",
    affiliateReady: true,
    scrapedAt: new Date().toISOString(),
    inStock: true
  };
  const result = validateOffer(offer, config);
  assert.equal(result.validationStatus, "ready");
  assert.equal(result.publishable, true);
});

test("compound score returns total and named components", () => {
  const result = scoreOfferDetailed({
    store: "amazon",
    title: "SSD NVMe",
    currentPrice: 349.9,
    previousPrice: 529.9,
    discountPercent: 34,
    rating: 4.8,
    reviewCount: 1200,
    inStock: true,
    storeReputation: "high",
    category: "tech",
    affiliateReady: true,
    validationStatus: "ready",
    sourceConfidence: 0.8
  }, { clicks: 12 });
  assert.ok(result.total >= 80);
  assert.ok(result.components.reliability > 0);
  assert.ok(result.components.attractiveness > 0);
  assert.ok(result.components.potential > 0);
  assert.ok(result.components.performance > 0);
});

test("blocked offer cannot publish even when draft is approved", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    const config = loadConfig({
      PUBLIC_BASE_URL: "http://localhost:4318",
      TELEGRAM_DRY_RUN: "true"
    });
    db.state.offers.push({
      id: "offer_blocked_publish",
      store: "amazon",
      title: "Produto Bloqueado",
      originalUrl: "https://www.amazon.com.br/dp/B0BLOCKED1",
      currentPrice: 349.9,
      inStock: true,
      validationStatus: "blocked",
      validationReasons: ["affiliate_not_ready"],
      publishable: false
    });
    db.state.drafts.push({
      id: "draft_blocked_publish",
      offerId: "offer_blocked_publish",
      channel: "telegram",
      text: "Oferta bloqueada\nhttps://x.test/go/abc",
      status: "approved",
      publishedAt: null,
      providerMessageId: null
    });
    const publish = await runPublishPipeline(db, config);
    assert.equal(publish.published, 0);
    assert.equal(publish.skipped, 1);
    assert.equal(publish.results.length, 1);
    assert.equal(publish.results[0].outcome, "skipped");
    assert.equal(publish.results[0].reason, "offer_not_publishable");
    assert.match(publish.results[0].detail, /offer_not_publishable/);
    assert.notEqual(db.state.drafts[0].status, "published");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("validate route refreshes validation score breakdown and status", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    db.state.offers.push({
      id: "offer_validate_refresh",
      store: "amazon",
      title: "SSD NVMe",
      currentPrice: 349.9,
      previousPrice: 529.9,
      discountPercent: 34,
      rating: 4.8,
      reviewCount: 1200,
      originalUrl: "https://www.amazon.com.br/dp/B0TEST1234",
      affiliateUrl: "https://amzn.to/42cFr9f",
      affiliateSource: "manual",
      affiliateReady: true,
      scrapedAt: new Date().toISOString(),
      inStock: true,
      category: "tech",
      validationStatus: "blocked",
      publishable: false,
      score: 0,
      status: "blocked"
    });
    const config = loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318" });
    const app = createApp({ db, config, publicDir: dir });
    const response = await request(app, {
      method: "POST",
      path: "/api/offers/offer_validate_refresh/validate"
    });
    assert.equal(response.status, 200);
    assert.equal(db.state.offers[0].validationStatus, "ready");
    assert.equal(db.state.offers[0].publishable, true);
    assert.ok(db.state.offers[0].score > 0);
    assert.ok(db.state.offers[0].scoreBreakdown.reliability > 0);
    assert.notEqual(db.state.offers[0].status, "blocked");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("manual affiliate route refreshes validation score breakdown and status", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    db.state.offers.push({
      id: "offer_affiliate_refresh",
      store: "amazon",
      title: "SSD NVMe",
      currentPrice: 349.9,
      previousPrice: 529.9,
      discountPercent: 34,
      rating: 4.8,
      reviewCount: 1200,
      originalUrl: "https://www.amazon.com.br/dp/B0TEST1234",
      scrapedAt: new Date().toISOString(),
      inStock: true,
      category: "tech",
      validationStatus: "blocked",
      publishable: false,
      score: 0,
      status: "blocked"
    });
    const config = loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318" });
    const app = createApp({ db, config, publicDir: dir });
    const response = await request(app, {
      method: "POST",
      path: "/api/offers/offer_affiliate_refresh/affiliate",
      body: { affiliateUrl: "https://amzn.to/42cFr9f" }
    });
    assert.equal(response.status, 200);
    assert.equal(db.state.offers[0].affiliateSource, "manual");
    assert.equal(db.state.offers[0].validationStatus, "ready");
    assert.equal(db.state.offers[0].publishable, true);
    assert.ok(db.state.offers[0].score > 0);
    assert.ok(db.state.offers[0].scoreBreakdown.reliability > 0);
    assert.notEqual(db.state.offers[0].status, "blocked");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("refresh affiliates route refreshes validation score breakdown and status", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    db.state.offers.push({
      id: "offer_refresh_affiliates",
      store: "amazon",
      title: "SSD NVMe",
      currentPrice: 349.9,
      previousPrice: 529.9,
      discountPercent: 34,
      rating: 4.8,
      reviewCount: 1200,
      originalUrl: "https://www.amazon.com.br/dp/B0TEST1234",
      scrapedAt: new Date().toISOString(),
      inStock: true,
      category: "tech",
      affiliateReady: false,
      validationStatus: "blocked",
      validationReasons: ["affiliate_not_ready"],
      publishable: false,
      score: 0,
      status: "blocked"
    });
    const config = loadConfig({
      PUBLIC_BASE_URL: "http://localhost:4318",
      AMAZON_AFFILIATE_TAG: "default-20"
    });
    const app = createApp({ db, config, publicDir: dir });
    const response = await request(app, {
      method: "POST",
      path: "/api/run/refresh-affiliates"
    });
    assert.equal(response.status, 200);
    assert.equal(db.state.offers[0].affiliateReady, true);
    assert.equal(db.state.offers[0].validationStatus, "ready");
    assert.equal(db.state.offers[0].publishable, true);
    assert.ok(db.state.offers[0].scoreBreakdown.reliability > 0);
    assert.notEqual(db.state.offers[0].status, "blocked");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("refresh affiliates preserves manual Amazon amzn.to affiliate readiness without tag config", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    db.state.offers.push({
      id: "offer_manual_amznto_refresh",
      store: "amazon",
      title: "SSD NVMe",
      currentPrice: 349.9,
      previousPrice: 529.9,
      discountPercent: 34,
      rating: 4.8,
      reviewCount: 1200,
      originalUrl: "https://www.amazon.com.br/dp/B0TEST1234",
      affiliateUrl: "https://amzn.to/42cFr9f",
      affiliateSource: "manual",
      affiliateReady: true,
      scrapedAt: new Date().toISOString(),
      inStock: true,
      category: "tech",
      validationStatus: "ready",
      publishable: true,
      score: 90,
      status: "auto_ready"
    });
    const config = loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318" });
    const app = createApp({ db, config, publicDir: dir });
    const response = await request(app, {
      method: "POST",
      path: "/api/run/refresh-affiliates"
    });
    assert.equal(response.status, 200);
    assert.equal(db.state.offers[0].affiliateReady, true);
    assert.equal(db.state.offers[0].publishable, true);
    assert.equal(db.state.offers[0].validationStatus, "ready");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("recommendations identify missing affiliate links", () => {
  const recommendations = buildRecommendations({
    offers: [{ id: "offer_1", title: "SSD", affiliateReady: false, validationStatus: "blocked", score: 91 }],
    drafts: [],
    clicks: [],
    publishLog: [],
    settings: { mode: "limited" }
  });
  assert.equal(recommendations[0].type, "fix_affiliate");
  assert.equal(recommendations[0].severity, "critical");
});

test("recommendations ignore archived offers missing affiliate links", () => {
  const recommendations = buildRecommendations({
    offers: [{ id: "offer_1", title: "SSD", affiliateReady: false, status: "archived", validationStatus: "blocked", score: 91 }],
    drafts: [],
    clicks: [],
    publishLog: [],
    settings: { mode: "limited" }
  });
  assert.equal(recommendations[0].type, "stable_pipeline");
});

test("recommendations do not mark approved Telegram drafts ready when linked offer is blocked", () => {
  const recommendations = buildRecommendations({
    offers: [{
      id: "offer_blocked_recommendation",
      title: "SSD",
      affiliateReady: true,
      validationStatus: "blocked",
      publishable: false,
      score: 91
    }],
    drafts: [{
      id: "draft_blocked_recommendation",
      offerId: "offer_blocked_recommendation",
      channel: "telegram",
      status: "approved"
    }],
    clicks: [],
    publishLog: [],
    settings: { mode: "limited" }
  });
  assert.equal(recommendations.some((item) => item.type === "publish_ready"), false);
});

test("state endpoint returns fresh recommendations after state changes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    db.state.recommendations = [{ id: "stable_pipeline", type: "stable_pipeline", severity: "info" }];
    db.state.offers.push({ id: "offer_1", title: "SSD", affiliateReady: false, validationStatus: "blocked", score: 91 });
    const config = loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318" });
    const app = createApp({ db, config, publicDir: dir });
    const response = await request(app, { path: "/api/state" });
    const payload = JSON.parse(response.text);
    assert.equal(response.status, 200);
    assert.equal(payload.recommendations[0].type, "fix_affiliate");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("state API includes diagnostics and recommendations", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    const config = loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318", TELEGRAM_DRY_RUN: "true" });
    const app = createApp({ db, config, publicDir: dir });
    const response = await request(app, { path: "/api/state" });
    const payload = JSON.parse(response.text);
    assert.equal(response.status, 200);
    assert.ok(payload.diagnostics.telegram);
    assert.ok(Array.isArray(payload.recommendations));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("diagnostics reports Telegram not ready when dry-run is enabled with credentials", () => {
  const config = loadConfig({
    PUBLIC_BASE_URL: "http://localhost:4318",
    TELEGRAM_DRY_RUN: "true",
    TELEGRAM_BOT_TOKEN: "token",
    TELEGRAM_CHAT_ID: "chat"
  });
  const diagnostics = buildDiagnostics({
    config,
    state: { publishLog: [] }
  });
  assert.equal(diagnostics.telegram.hasBotToken, true);
  assert.equal(diagnostics.telegram.hasChatId, true);
  assert.equal(diagnostics.telegram.dryRun, true);
  assert.equal(diagnostics.telegram.ready, false);
});

test("analytics report stores actionable recommendations", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    db.state.offers.push({ id: "offer_1", title: "SSD", affiliateReady: false, validationStatus: "blocked", score: 91 });
    const report = createAnalyticsReport(db);
    assert.ok(report.recommendations.length >= 1);
    assert.equal(db.state.recommendations.length >= 1, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("publish pipeline records failed details when Telegram fetch throws", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("connection reset");
  };
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    const config = loadConfig({
      PUBLIC_BASE_URL: "http://localhost:4318",
      TELEGRAM_DRY_RUN: "false",
      TELEGRAM_BOT_TOKEN: "token",
      TELEGRAM_CHAT_ID: "chat"
    });
    db.state.offers.push({
      id: "offer_network_failure",
      store: "amazon",
      title: "Produto Teste",
      originalUrl: "https://www.amazon.com.br/dp/B0TEST1234",
      affiliateUrl: "https://amzn.to/42cFr9f",
      affiliateSource: "manual",
      affiliateReady: true,
      currentPrice: 349.9,
      scrapedAt: new Date().toISOString(),
      inStock: true,
      publishable: true,
      validationStatus: "ready"
    });
    db.state.drafts.push({
      id: "draft_network_failure",
      offerId: "offer_network_failure",
      channel: "telegram",
      text: "Oferta teste\nhttps://x.test/go/abc",
      status: "approved",
      publishedAt: null,
      providerMessageId: null
    });
    const publish = await runPublishPipeline(db, config);
    assert.equal(publish.published, 0);
    assert.equal(publish.failed, 1);
    assert.equal(publish.results.length, 1);
    assert.equal(publish.results[0].outcome, "failed");
    assert.equal(publish.results[0].dryRun, false);
    assert.match(publish.results[0].detail, /connection reset/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
});

test("ui tokens define the command-center navigation", () => {
  assert.deepEqual(commandItems.map((item) => item.view), ["overview", "operation", "offers", "ai", "config"]);
  assert.equal(viewMeta.overview.title, "Performance");
  assert.equal(viewMeta.operation.title, "Operacao");
  assert.equal(densityForView("operation"), "compact");
  assert.equal(densityForView("overview"), "comfortable");
});

test("ui status tones and labels stay consistent", () => {
  assert.equal(statusTone("auto_ready"), "success");
  assert.equal(statusTone("blocked"), "danger");
  assert.equal(statusTone("needs_review"), "warning");
  assert.equal(uiStatusLabel("published"), "Publicado");
  assert.equal(uiChannelLabel("telegram"), "Telegram");
  assert.equal(uiMoney(349.9), "R$ 349,90");
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}

if (failed) process.exit(1);
console.log(`${tests.length} tests passed`);

function request(app, { method = "GET", path = "/", body = null, headers = {} }) {
  return new Promise((resolve, reject) => {
    app.listen(0, "127.0.0.1", () => {
      const { port } = app.address();
      const payload = body ? JSON.stringify(body) : "";
      const req = globalThis.fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { "content-type": "application/json", ...headers },
        body: payload || undefined
      });
      req.then(async (response) => {
        const text = await response.text();
        app.close();
        resolve({ status: response.status, text });
      }).catch((error) => {
        app.close();
        reject(error);
      });
    });
  });
}
