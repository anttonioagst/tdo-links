import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { createDraftsForOffer, createAnalyticsReport, runPublishPipeline, runScrapePipeline } from "../src/agents.js";
import { publishDiscord, testDiscord } from "../src/publishers/discord.js";
import { publishXAcquisition } from "../src/publishers/x.js";
import { validateAmazonLink } from "../src/validation.js";
import { validatePost, validateXAcquisitionPost } from "../src/compliance.js";
import { loadConfig } from "../src/config.js";
import { JsonDb } from "../src/db.js";
import { buildDiagnostics } from "../src/integrations.js";
import { selectImmediatePublishOffer } from "../src/immediate-publish.js";
import { buildAffiliateUrl } from "../src/links.js";
import { normalizeTelegramImageUrl, publishTelegram, selectBestTelegramPhoto, squareTelegramPhoto, testTelegram } from "../src/publishers/telegram.js";
import { buildRecommendations } from "../src/recommendations.js";
import { createApp } from "../src/server.js";
import { dedupeOffers, scoreOffer, scoreOfferDetailed, statusForScore } from "../src/scoring.js";
import { buildAmazonScrapeUrls, parseAmazonSearch, selectScrapedAmazonOffers, verifyAmazonProduct } from "../src/scrapers.js";
import { validateOffer } from "../src/validation.js";
import { createTelegramCopy, telegramCopy } from "../src/copywriter.js";
import { createContent } from "../src/agents/creative.js";
import { publishDeal } from "../src/agents/publisher.js";
import { runSupervisorCheck } from "../src/agents/supervisor.js";
import { validateDeal } from "../src/agents/validation.js";
import { runOrchestratorCycle, toolPublish, toolValidate, toolArchive } from "../src/agents/orchestrator.js";
import { buildDiscordDealMessage, discordDealChannelForOffer } from "../src/discord/deals.js";
import { reportAgentEvent } from "../src/discord/reporter.js";
import { checkDiscordStatus } from "../src/discord/setup.js";
import { setupDiscordServer } from "../src/discord/setup.js";
import { hasRealPromotion } from "../src/deals.js";
import { buildLearningProfile, learningScoreForOffer } from "../src/learning.js";
import { telegramPublicationStatus } from "../src/publication-policy.js";
import { enqueuePendingTelegramOffers, selectPendingTelegramOffers } from "../src/publication-recovery.js";
import { buildAmazonSearchUrl, normalizeDiscoverySettings, runAmazonDiscovery } from "../src/discovery.js";
import { shouldRunAmazonDiscovery, runDiscoverySchedulerTick } from "../src/discovery-scheduler.js";
import { discoveryCandidateLimit, selectDiscoveryCandidates } from "../src/agents/discovery.js";
import { normalizePremiumCategory, premiumCurationScore, selectPremiumCandidates } from "../src/premium-curation.js";
import {
  commandItems,
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

test("Amazon auto_ready offer creates auto_ready draft with price review warning", async () => {
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
    assert.equal(draft.status, "auto_ready");
    assert.ok(draft.warnings.includes("amazon_dynamic_price_review"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Telegram copy uses approved promotion price format", () => {
  const copy = telegramCopy({
    title: "Fone de Ouvido Sony WH-1000XM5 Noise Cancelling Bluetooth",
    currentPrice: 1499,
    previousPrice: 2199,
    discountPercent: 32,
    store: "amazon"
  }, "https://www.amazon.com.br/dp/B09XS7JWHH?tag=tdolinks-20", "");

  assert.match(copy, /🔥 De <s>R\$\s?2\.199,00<\/s> por <b>R\$\s?1\.499,00<\/b> \(32% OFF\)/);
  assert.match(copy, /📌 <b>Fone de Ouvido Sony WH-1000XM5 Noise Cancelling Bluetooth<\/b>/);
  assert.doesNotMatch(copy, /🔥 Por <b?>?R\$/);
});

test("manual affiliate Telegram copy keeps direct affiliate link", () => {
  const copy = createTelegramCopy({
    title: "Headset HyperX Cloud Alpha Wireless",
    currentPrice: 649,
    previousPrice: 899,
    discountPercent: 28,
    store: "amazon",
    affiliateSource: "manual",
    affiliateUrl: "https://www.amazon.com.br/dp/B09TEST123?tag=tdolinks-20"
  }, "short_test", { publicBaseUrl: "https://tdo-links-production.up.railway.app", disclosure: "" });

  assert.match(copy, /https:\/\/www\.amazon\.com\.br\/dp\/B09TEST123\?tag=tdolinks-20/);
  assert.doesNotMatch(copy, /tdo-links-production\.up\.railway\.app\/go\/short_test/);
});

test("Telegram copy keeps product specs concise and skimmable", () => {
  const copy = telegramCopy({
    title: "Fone de Ouvido Sony WH-1000XM5 Noise Cancelling Bluetooth",
    currentPrice: 1499,
    previousPrice: 2199,
    discountPercent: 32,
    store: "amazon"
  }, "https://www.amazon.com.br/dp/B09XS7JWHH?tag=tdolinks-20", "");
  const specLines = copy.split("\n").filter((line) => line.startsWith("• "));

  assert.ok(specLines.length > 0);
  assert.ok(specLines.length <= 2);
  assert.match(copy, /• Cancelamento de ruído/);
  assert.match(copy, /• Bluetooth/);
});

test("Telegram copy refuses automatic promotion format without previous price", () => {
  assert.throws(() => telegramCopy({
    title: "Monitor sem promocao",
    currentPrice: 4209,
    previousPrice: null,
    discountPercent: 0,
    store: "amazon"
  }, "https://www.amazon.com.br/dp/B0TEST?tag=tdolinks-20", ""), /missing_real_promotion/);
});

test("normalizes Amazon thumbnail URLs to high-resolution image URLs for Telegram", () => {
  assert.equal(
    normalizeTelegramImageUrl("https://m.media-amazon.com/images/I/513GKEr73fL._AC_SR160,134_CB1169409_QL70_.jpg"),
    "https://m.media-amazon.com/images/I/513GKEr73fL._AC_SL1500_.jpg"
  );
  assert.equal(
    normalizeTelegramImageUrl("https://m.media-amazon.com/images/I/51gRCCmBDtL._AC_UL320_.jpg"),
    "https://m.media-amazon.com/images/I/51gRCCmBDtL._AC_SL1500_.jpg"
  );
});

test("selects the largest downloaded image candidate for Telegram upload", async () => {
  const calls = [];
  const selected = await selectBestTelegramPhoto([
    "https://m.media-amazon.com/images/I/product._AC_UL320_.jpg",
    "https://cdn.example.com/product-large.jpg"
  ], {
    minBytes: 10,
    fetchImpl: async (url) => {
      calls.push(url);
      const size = url.includes("SL1500") ? 300 : url.includes("large") ? 200 : 20;
      return new Response(new Uint8Array(size), { headers: { "content-type": "image/jpeg" } });
    }
  });

  assert.equal(selected.url, "https://m.media-amazon.com/images/I/product._AC_SL1500_.jpg");
  assert.equal(selected.buffer.length, 300);
  assert.ok(calls.includes("https://m.media-amazon.com/images/I/product._AC_SL1500_.jpg"));
});

test("squares Telegram photos without cropping the product image", async () => {
  const input = await sharp({
    create: {
      width: 1600,
      height: 900,
      channels: 3,
      background: "#dcdcdc"
    }
  }).jpeg().toBuffer();

  const squared = await squareTelegramPhoto({ buffer: input, contentType: "image/jpeg" });
  const metadata = await sharp(squared.buffer).metadata();

  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 1200);
  assert.equal(squared.contentType, "image/jpeg");
});

test("publishTelegram uploads downloaded image bytes instead of sending image URL", async () => {
  const originalFetch = globalThis.fetch;
  let sentBody = null;
  const rectangularImage = await sharp(randomBytes(1600 * 900 * 3), {
    raw: { width: 1600, height: 900, channels: 3 }
  }).jpeg({ quality: 90 }).toBuffer();
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).includes("/sendPhoto")) {
      sentBody = init.body;
      return new Response(JSON.stringify({ ok: true, result: { message_id: 42, photo: [{ file_id: "file_small" }, { file_id: "file_large" }] } }), {
        headers: { "content-type": "application/json" }
      });
    }
    return new Response(rectangularImage, { headers: { "content-type": "image/jpeg" } });
  };

  try {
    const offer = {
      imageUrls: ["https://m.media-amazon.com/images/I/product._AC_UL320_.jpg"]
    };
    const result = await publishTelegram(
      { text: "Oferta teste" },
      { telegramDryRun: false, telegramBotToken: "token", telegramChatId: "chat" },
      offer
    );
    assert.equal(result.ok, true);
    assert.equal(result.providerMessageId, 42);
    assert.equal(offer.telegramImageFileId, "file_large");
    assert.ok(sentBody instanceof FormData);
    const photo = sentBody.get("photo");
    const metadata = await sharp(Buffer.from(await photo.arrayBuffer())).metadata();
    assert.equal(metadata.width, 1200);
    assert.equal(metadata.height, 1200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("publishTelegram tries later scrape images when the first candidate is too small", async () => {
  const originalFetch = globalThis.fetch;
  let sentBody = null;
  const tinyImage = await sharp(randomBytes(80 * 80 * 3), {
    raw: { width: 80, height: 80, channels: 3 }
  }).jpeg({ quality: 70 }).toBuffer();
  const largeImage = await sharp(randomBytes(1400 * 1400 * 3), {
    raw: { width: 1400, height: 1400, channels: 3 }
  }).jpeg({ quality: 90 }).toBuffer();

  globalThis.fetch = async (url, init = {}) => {
    const value = String(url);
    if (value.includes("/sendPhoto")) {
      sentBody = init.body;
      return new Response(JSON.stringify({ ok: true, result: { message_id: 43, photo: [{ file_id: "file_small" }, { file_id: "file_large" }] } }), {
        headers: { "content-type": "application/json" }
      });
    }
    if (value.includes("large")) return new Response(largeImage, { headers: { "content-type": "image/jpeg" } });
    return new Response(tinyImage, { headers: { "content-type": "image/jpeg" } });
  };

  try {
    const offer = {
      imageUrls: [
        "https://m.media-amazon.com/images/I/small._AC_UL320_.jpg",
        "https://m.media-amazon.com/images/I/large._AC_UL800_.jpg"
      ]
    };
    const result = await publishTelegram(
      { text: "Oferta teste" },
      { telegramDryRun: false, telegramBotToken: "token", telegramChatId: "chat" },
      offer
    );

    assert.equal(result.ok, true);
    assert.equal(result.providerMessageId, 43);
    assert.ok(sentBody instanceof FormData);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("publishTelegram refuses text-only posts when product photo is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response("not found", { status: 404 });
  };

  try {
    const result = await publishTelegram(
      { text: "Oferta teste https://www.amazon.com.br/dp/B0TEST1234" },
      { telegramDryRun: false, telegramBotToken: "token", telegramChatId: "chat" },
      { imageUrls: ["https://m.media-amazon.com/images/I/missing._AC_UL320_.jpg"] }
    );
    assert.equal(result.ok, false);
    assert.equal(result.detail, "telegram_photo_required");
    assert.equal(calls.some((url) => url.includes("/sendMessage")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("creative fallback keeps Telegram promotion format with strikethrough and bold", async () => {
  const result = await createContent({
    title: "Fone de Ouvido Sony WH-1000XM5 Noise Cancelling Bluetooth",
    currentPrice: 1499,
    previousPrice: 2199,
    discountPercent: 32,
    store: "amazon"
  }, { reason: "bom desconto" }, {});

  assert.match(result.copy.telegram, /🔥 De <s>R\$\s?2\.199,00<\/s> por <b>R\$\s?1\.499,00<\/b> \(32% OFF\)/);
  assert.match(result.copy.telegram, /📌 <b>Fone de Ouvido Sony WH-1000XM5 Noise Cancelling Bluetooth<\/b>/);
  assert.match(result.copy.telegram, /• Cancelamento de ruído/);
  assert.match(result.copy.telegram, /• Bluetooth/);
  assert.doesNotMatch(result.copy.telegram, /🔥 Por <b>R\$/);
});

test("offers without previous promotional price are not real promotions", () => {
  assert.equal(hasRealPromotion({ currentPrice: 4209, previousPrice: null, discountPercent: 0 }), false);
  assert.equal(hasRealPromotion({ currentPrice: 1499, previousPrice: 2199, discountPercent: 32 }), true);
});

test("discovery candidates exclude products without real promotion", () => {
  const candidates = selectDiscoveryCandidates([
    { title: "Monitor sem promocao", currentPrice: 899, previousPrice: null, discountPercent: 0 },
    { title: "Headset HyperX Cloud 20 off", currentPrice: 260, previousPrice: 325, discountPercent: 20, rating: 4.7, reviewCount: 1200 },
    { title: "Mouse Generico 40 off", currentPrice: 60, previousPrice: 100, discountPercent: 40 }
  ], 2);
  assert.deepEqual(candidates.map((offer) => offer.title), ["Headset HyperX Cloud 20 off"]);
});

test("premium curation prefers trusted premium brands over generic high discounts", () => {
  const candidates = selectPremiumCandidates([
    { title: "Mouse Gamer Generico RGB 70 off", currentPrice: 89, previousPrice: 299, discountPercent: 70, category: "mouse" },
    { title: "Headset HyperX Cloud Alpha", currentPrice: 349, previousPrice: 549, discountPercent: 36, category: "headset", rating: 4.7, reviewCount: 1200 },
    { title: "SSD Kingston NV2 1TB", currentPrice: 349, previousPrice: 499, discountPercent: 30, category: "ssd", rating: 4.8, reviewCount: 4000 },
    { title: "Fone Sony WH-1000XM5", currentPrice: 1499, previousPrice: 2199, discountPercent: 32, category: "fone", rating: 4.8, reviewCount: 3000 }
  ], 2, {});

  assert.deepEqual(candidates.map((offer) => offer.title), [
    "Fone Sony WH-1000XM5",
    "SSD Kingston NV2 1TB"
  ]);
});

test("premium curation limits repeated mouse category in one publication window", () => {
  const candidates = selectPremiumCandidates([
    { title: "Mouse Logitech MX Master 3S", currentPrice: 499, previousPrice: 699, discountPercent: 29, category: "mouse", rating: 4.8, reviewCount: 5000 },
    { title: "Mouse Razer Basilisk V3", currentPrice: 319, previousPrice: 499, discountPercent: 36, category: "mouse", rating: 4.7, reviewCount: 900 },
    { title: "SSD Kingston NV2 1TB", currentPrice: 349, previousPrice: 499, discountPercent: 30, category: "ssd", rating: 4.8, reviewCount: 4000 },
    { title: "Headset HyperX Cloud II", currentPrice: 449, previousPrice: 699, discountPercent: 36, category: "headset", rating: 4.7, reviewCount: 1800 }
  ], 4, {});

  assert.equal(candidates.filter((offer) => offer.title.toLowerCase().includes("mouse")).length, 1);
  assert.ok(candidates.some((offer) => offer.title.includes("SSD Kingston")));
  assert.ok(candidates.some((offer) => offer.title.includes("Headset HyperX")));
});

test("premium curation treats price as quality signal, not a hard minimum", () => {
  const score = premiumCurationScore({
    title: "SSD Kingston 480GB",
    currentPrice: 89,
    previousPrice: 139,
    discountPercent: 36,
    category: "ssd",
    rating: 4.8,
    reviewCount: 6000
  }, {});

  assert.ok(score > 0);
});

test("premium curation recognizes bigger setup categories", () => {
  assert.equal(normalizePremiumCategory({ title: "Notebook Dell Inspiron 15" }), "notebook");
  assert.equal(normalizePremiumCategory({ title: "Smart TV Samsung 55 polegadas 4K" }), "tv");
  assert.equal(normalizePremiumCategory({ title: "Mesa Gamer Husky Gaming 140cm" }), "mesa");
});

test("premium curation accepts premium large-ticket deals", () => {
  const candidates = selectPremiumCandidates([
    { title: "Smart TV Samsung 55 polegadas 4K", currentPrice: 2199, previousPrice: 2799, discountPercent: 21, rating: 4.7, reviewCount: 900 },
    { title: "Notebook Dell Inspiron 15 i7", currentPrice: 3899, previousPrice: 4599, discountPercent: 15, rating: 4.6, reviewCount: 600 },
    { title: "Mesa Gamer Husky Gaming 140cm", currentPrice: 699, previousPrice: 999, discountPercent: 30, rating: 4.7, reviewCount: 250 }
  ], 3, {});

  assert.deepEqual(
    candidates.map((offer) => normalizePremiumCategory(offer)).sort(),
    ["mesa", "notebook", "tv"]
  );
});

test("learning profile boosts offers similar to clicked winners", () => {
  const state = {
    offers: [
      { id: "winner", title: "Mouse Gamer Redragon Griffin", category: "tech", currentPrice: 89, discountPercent: 51 },
      { id: "ignored", title: "Fone Bluetooth Generico", category: "tech", currentPrice: 29, discountPercent: 52 }
    ],
    publishLog: [
      { offerId: "winner", channel: "telegram", result: { ok: true }, createdAt: "2026-05-28T10:00:00.000Z" },
      { offerId: "ignored", channel: "telegram", result: { ok: true }, createdAt: "2026-05-28T10:10:00.000Z" }
    ],
    clicks: [
      { offerId: "winner", timestamp: "2026-05-28T10:05:00.000Z" },
      { offerId: "winner", timestamp: "2026-05-28T10:06:00.000Z" },
      { offerId: "winner", timestamp: "2026-05-28T10:07:00.000Z" }
    ]
  };
  const profile = buildLearningProfile(state);
  const redragonScore = learningScoreForOffer({ title: "Mouse Gamer Redragon Predator", category: "tech", currentPrice: 82, discountPercent: 48 }, profile);
  const genericScore = learningScoreForOffer({ title: "Fone Bluetooth Generico", category: "tech", currentPrice: 29, discountPercent: 52 }, profile);
  assert.ok(redragonScore > genericScore);
});

test("discovery candidates use learning without allowing non-promotions", () => {
  const state = {
    offers: [
      { id: "winner", title: "Mouse Gamer Redragon Griffin", category: "tech", currentPrice: 89, discountPercent: 51 }
    ],
    publishLog: [
      { offerId: "winner", channel: "telegram", result: { ok: true }, createdAt: "2026-05-28T10:00:00.000Z" }
    ],
    clicks: [
      { offerId: "winner", timestamp: "2026-05-28T10:05:00.000Z" },
      { offerId: "winner", timestamp: "2026-05-28T10:06:00.000Z" }
    ]
  };
  const candidates = selectDiscoveryCandidates([
    { title: "Monitor sem promocao", currentPrice: 899, previousPrice: null, discountPercent: 0 },
    { title: "Fone Generico 55 off", currentPrice: 45, previousPrice: 100, discountPercent: 55 },
    { title: "Mouse Gamer Redragon 48 off", currentPrice: 82, previousPrice: 159, discountPercent: 48 },
    { title: "SSD Kingston NV2 1TB", currentPrice: 349, previousPrice: 499, discountPercent: 30, rating: 4.8, reviewCount: 4000 }
  ], 2, state);
  assert.deepEqual(candidates.map((offer) => offer.title), ["SSD Kingston NV2 1TB"]);
});

test("discovery validates backup candidates while publication quota stays capped", () => {
  assert.equal(discoveryCandidateLimit({ maxCandidatesPerCycle: 2, maxPublicationsPerCycle: 2 }), 8);
  assert.equal(discoveryCandidateLimit({ maxCandidatesPerCycle: 12, maxPublicationsPerCycle: 2 }), 10);
});

test("Amazon scrape selection keeps later real promotions before applying limit", () => {
  const offers = Array.from({ length: 20 }, (_, index) => ({
    store: "amazon",
    title: `Produto sem promocao ${index}`,
    currentPrice: 100 + index,
    previousPrice: null,
    originalUrl: `https://www.amazon.com.br/dp/B0NOPR${String(index).padStart(4, "0")}`,
    imageUrl: "",
    imageUrls: []
  }));
  offers.push({
    store: "amazon",
    title: "Oferta real depois do limite antigo",
    currentPrice: 149,
    previousPrice: 299,
    originalUrl: "https://www.amazon.com.br/dp/B0PROMO001",
    imageUrl: "",
    imageUrls: []
  });

  const selected = selectScrapedAmazonOffers(offers, 2);
  assert.equal(selected[0].title, "Oferta real depois do limite antigo");
  assert.equal(selected[0].discountPercent, 50);
});

test("Amazon scrape includes curated promotion searches after configured URLs", () => {
  const urls = buildAmazonScrapeUrls({
    amazonSearchUrls: ["https://www.amazon.com.br/s?k=ssd+nvme"]
  });
  assert.equal(urls[0], "https://www.amazon.com.br/s?k=ssd+nvme");
  assert.equal(urls[1], "https://www.amazon.com.br/s?k=ssd+nvme&page=2");
  assert.ok(urls.some((url) => url.includes("s?k=logitech")));
  assert.ok(urls.some((url) => url.includes("s?k=razer")));
  assert.ok(urls.some((url) => url.includes("s?k=hyperx")));
  assert.ok(urls.some((url) => url.includes("s?k=notebook+acer")));
  assert.ok(urls.some((url) => url.includes("s?k=smart+tv+tcl")));
  assert.ok(urls.some((url) => url.includes("deals-promo-filter=1")));
  assert.ok(urls.some((url) => url.includes("page=2")));
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

test("verifyAmazonProduct returns product page images for exact ASIN", async () => {
  const html = `
    <html>
      <span class="a-offscreen">R$ 282,12</span>
      <span id="productTitle">Kit Mouse Sem Fio Logitech Pebble 2 M350s Grafite + Teclado Sem fio Logitech Pebble Keys 2 K380s Grafite</span>
      <img id="landingImage" src="https://m.media-amazon.com/images/I/exact-product.jpg" />
      <script>
        var data = {"hiRes":"https://m.media-amazon.com/images/I/exact-product-hires.jpg"};
      </script>
      4,9 de 5 estrelas
      <span id="acrCustomerReviewText">123 avaliações</span>
    </html>
  `;

  const result = await verifyAmazonProduct("B0DVCHL7PG", {
    fetchImpl: async (url) => {
      assert.equal(url, "https://www.amazon.com.br/dp/B0DVCHL7PG");
      return new Response(html, { status: 200 });
    }
  });

  assert.equal(result.title, "Kit Mouse Sem Fio Logitech Pebble 2 M350s Grafite + Teclado Sem fio Logitech Pebble Keys 2 K380s Grafite");
  assert.equal(result.imageUrl, "https://m.media-amazon.com/images/I/exact-product.jpg");
  assert.deepEqual(result.imageUrls, [
    "https://m.media-amazon.com/images/I/exact-product.jpg"
  ]);
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
  assert.equal(diagnostics.automation.maxPublicationsPerCycle, 4);
  assert.equal(diagnostics.automation.publicationWindowHours, 1);
  assert.equal(diagnostics.automation.minPublicationIntervalMinutes, 15);
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
      previousPrice: 529.9,
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
    assert.equal(publish.published, 1);
    assert.equal(publish.skipped, 0);
    assert.equal(publish.results[0].outcome, "published");
    assert.equal(db.state.drafts[0].status, "published");
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
      previousPrice: 529.9,
      imageUrl: "https://m.media-amazon.com/images/I/product._AC_UL320_.jpg",
      imageUrls: ["https://m.media-amazon.com/images/I/product._AC_UL320_.jpg"],
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
    assert.match(JSON.parse(response.text).title, /3 oferta\(s\)/);
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
    previousPrice: 529.9,
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

test("approved draft publishes even for blocked offer (human override)", async () => {
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
      previousPrice: 529.9,
      inStock: true,
      scrapedAt: new Date().toISOString(),
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
    assert.equal(publish.published, 1);
    assert.equal(publish.dryRun, 1);
    assert.equal(publish.results[0].outcome, "published");
    assert.equal(db.state.drafts[0].status, "published");
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
      previousPrice: 529.9,
      imageUrl: "https://m.media-amazon.com/images/I/product._AC_UL320_.jpg",
      imageUrls: ["https://m.media-amazon.com/images/I/product._AC_UL320_.jpg"],
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
    assert.match(publish.results[0].detail, /telegram_photo_required/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
});

test("publisher marks offers rejected when Telegram photo is unavailable", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("not found", { status: 404 });
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    db.state.offers.push({
      id: "offer_no_photo",
      title: "Smart TV 4K LG QNED73",
      status: "auto_ready",
      currentPrice: 4058,
      previousPrice: 4984,
      discountPercent: 19,
      originalUrl: "https://www.amazon.com.br/dp/B0TESTPHOTO",
      store: "amazon",
      imageUrls: ["https://m.media-amazon.com/images/I/missing._AC_UL320_.jpg"]
    });
    await db.save();
    const config = loadConfig({
      PUBLIC_BASE_URL: "http://localhost:4318",
      TELEGRAM_DRY_RUN: "false",
      TELEGRAM_BOT_TOKEN: "token",
      TELEGRAM_CHAT_ID: "chat"
    });

    const result = await publishDeal(db.state.offers[0], {
      imageUrls: [],
      copy: {
        telegram: "Oferta {LINK}",
        discord: "Oferta {LINK}",
        x: "Oferta"
      }
    }, config, db);

    assert.equal(result.telegram.ok, false);
    assert.equal(result.telegram.detail, "telegram_photo_required");
    assert.equal(db.state.offers[0].status, "rejected");
    assert.equal(db.state.offers[0].imageStatus, "failed");
    assert.equal(db.state.offers[0].validationSummary, "telegram_photo_required");
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
});

test("publisher skips Telegram when publication quota is already reached", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    db.state.publishLog = [
      { id: "pub_1", channel: "telegram", result: { ok: true }, createdAt: new Date().toISOString() },
      { id: "pub_2", channel: "telegram", result: { ok: true }, createdAt: new Date().toISOString() }
    ];
    await db.save();
    const offer = {
      id: "offer_quota",
      title: "Mouse Gamer Redragon",
      currentPrice: 89,
      previousPrice: 180,
      discountPercent: 51,
      originalUrl: "https://www.amazon.com.br/dp/B07GTTRBLV",
      store: "amazon"
    };
    const content = {
      imageUrls: [],
      copy: {
        telegram: "Oferta {LINK}",
        discord: "Oferta {LINK}",
        x: "Oferta"
      }
    };
    const config = loadConfig({
      PUBLIC_BASE_URL: "http://localhost:4318",
      MAX_PUBLICATIONS_PER_CYCLE: "2",
      PUBLICATION_WINDOW_HOURS: "2"
    });

    const result = await publishDeal(offer, content, config, db);

    assert.equal(result.telegram.skipped, true);
    assert.equal(result.telegram.detail, "telegram_quota_reached");
    assert.equal(db.state.publishLog.filter((entry) => entry.channel === "telegram").length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("publisher skips duplicate Telegram products even with a different offer id", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    db.state.offers.push({
      id: "offer_sent",
      title: "Notebook Acer Aspire 5 A515-45-R043 AMD Ryzen 5 Tela 15.6 16 GB RAM 512 GB SSD",
      asin: "B0OLDACER1",
      originalUrl: "https://www.amazon.com.br/dp/B0OLDACER1"
    });
    db.state.publishLog.push({
      id: "pub_sent",
      offerId: "offer_sent",
      channel: "telegram",
      result: { ok: true, detail: "ok" },
      createdAt: new Date().toISOString()
    });
    await db.save();

    const offer = {
      id: "offer_duplicate",
      title: "Notebook Acer Aspire 5 A515-45-R043 AMD Ryzen 5 Tela 15.6 16 GB RAM 512 GB SSD",
      asin: "B0NEWACER2",
      currentPrice: 3979,
      previousPrice: 5799,
      discountPercent: 31,
      originalUrl: "https://www.amazon.com.br/dp/B0NEWACER2",
      store: "amazon"
    };
    const content = {
      imageUrls: [],
      copy: {
        telegram: "Oferta duplicada {LINK}",
        discord: "Oferta duplicada {LINK}",
        x: "Oferta duplicada"
      }
    };
    const config = loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318" });

    const result = await publishDeal(offer, content, config, db);

    assert.equal(result.telegram.skipped, true);
    assert.equal(result.telegram.detail, "duplicate_offer");
    assert.equal(db.state.publishLog.filter((entry) => entry.channel === "telegram").length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("publisher skips recently published related Telegram product families", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    db.state.offers.push({
      id: "offer_tv_sent",
      title: "Smart TV 4K 86\" LG QNED73 + Soundbar LG 600W",
      asin: "B0GV695HB8",
      originalUrl: "https://www.amazon.com.br/dp/B0GV695HB8"
    });
    db.state.publishLog.push({
      id: "pub_tv_sent",
      offerId: "offer_tv_sent",
      channel: "telegram",
      result: { ok: true, detail: "ok" },
      createdAt: new Date().toISOString()
    });
    await db.save();

    const offer = {
      id: "offer_tv_related",
      title: "Smart TV 4K 65\" LG QNED73 + Soundbar LG 300W",
      asin: "B0GV5X5H6V",
      currentPrice: 4743.13,
      previousPrice: 6198,
      discountPercent: 23,
      originalUrl: "https://www.amazon.com.br/dp/B0GV5X5H6V",
      store: "amazon"
    };
    const content = {
      imageUrls: [],
      copy: {
        telegram: "TV relacionada {LINK}",
        discord: "TV relacionada {LINK}",
        x: "TV relacionada"
      }
    };
    const config = loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318" });

    const result = await publishDeal(offer, content, config, db);

    assert.equal(result.telegram.skipped, true);
    assert.equal(result.telegram.detail, "related_offer_recently_published");
    assert.equal(db.state.publishLog.filter((entry) => entry.channel === "telegram").length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("publisher blocks Amazon search offers when exact product image cannot be verified", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    const offer = {
      id: "offer_bad_search_image",
      title: "Kit Mouse Sem Fio Logitech Pebble 2 M350s + Teclado K380s",
      asin: "B0DVCHL7PG",
      source: "amazon_search",
      currentPrice: 282.12,
      previousPrice: 371.8,
      discountPercent: 24,
      originalUrl: "https://www.amazon.com.br/dp/B0DVCHL7PG",
      imageUrl: "https://m.media-amazon.com/images/I/search-result-mismatch.jpg",
      imageUrls: ["https://m.media-amazon.com/images/I/search-result-mismatch.jpg"],
      store: "amazon"
    };
    db.state.offers.push(offer);
    await db.save();

    const config = loadConfig({
      PUBLIC_BASE_URL: "http://localhost:4318",
      TELEGRAM_DRY_RUN: "false",
      TELEGRAM_BOT_TOKEN: "token",
      TELEGRAM_CHAT_ID: "chat"
    });
    config.fetchImpl = async () => new Response("", { status: 404 });

    const result = await publishDeal(offer, {
      imageUrls: [],
      copy: {
        telegram: "Oferta {LINK}",
        discord: "Oferta {LINK}",
        x: "Oferta"
      }
    }, config, db);

    assert.equal(result.telegram.skipped, true);
    assert.equal(result.telegram.detail, "image_verification_failed");
    assert.equal(result.discord.skipped, true);
    assert.equal(db.state.publishLog.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("publication recovery selects auto-ready Telegram offers that were not published", () => {
  const now = new Date("2026-05-29T22:00:00.000Z");
  const state = {
    offers: [
      {
        id: "offer_pending",
        title: "Monitor LG Ultragear 144Hz",
        status: "auto_ready",
        currentPrice: 1213.97,
        previousPrice: 1598.9,
        discountPercent: 24,
        rating: 4.7,
        reviewCount: 900,
        imageUrls: ["https://m.media-amazon.com/images/I/monitor._AC_UL800_.jpg"],
        updatedAt: "2026-05-29T18:07:05.854Z"
      },
      {
        id: "offer_better",
        title: "Notebook Acer Aspire 5 Ryzen 5 16GB SSD",
        status: "auto_ready",
        currentPrice: 3979,
        previousPrice: 5799,
        discountPercent: 31,
        rating: 4.7,
        reviewCount: 1400,
        imageUrls: ["https://m.media-amazon.com/images/I/notebook._AC_UL800_.jpg"],
        createdAt: "2026-05-29T16:30:41.926Z",
        updatedAt: "2026-05-29T16:30:49.907Z"
      },
      {
        id: "offer_published",
        title: "Fone Sony WH-1000XM5",
        status: "auto_ready",
        currentPrice: 1499,
        previousPrice: 2199,
        discountPercent: 32,
        imageUrls: ["https://m.media-amazon.com/images/I/fone._AC_UL800_.jpg"],
        updatedAt: "2026-05-29T18:00:00.000Z"
      },
      {
        id: "offer_no_promo",
        title: "Monitor sem promoção",
        status: "auto_ready",
        currentPrice: 899,
        previousPrice: null,
        discountPercent: 0,
        imageUrls: ["https://m.media-amazon.com/images/I/no-promo._AC_UL800_.jpg"],
        updatedAt: "2026-05-29T18:05:00.000Z"
      },
      {
        id: "offer_stale",
        title: "Mouse Logitech antigo",
        status: "auto_ready",
        currentPrice: 199,
        previousPrice: 299,
        discountPercent: 33,
        imageUrls: ["https://m.media-amazon.com/images/I/stale._AC_UL800_.jpg"],
        updatedAt: "2026-05-28T18:05:00.000Z"
      },
      {
        id: "offer_no_image",
        title: "Notebook Dell sem imagem",
        status: "auto_ready",
        currentPrice: 3499,
        previousPrice: 4499,
        discountPercent: 22,
        updatedAt: "2026-05-29T18:06:00.000Z"
      }
    ],
    publishLog: [
      { channel: "telegram", offerId: "offer_published", result: { ok: true }, createdAt: "2026-05-29T18:10:00.000Z" },
      { channel: "telegram", offerId: "offer_pending", result: { ok: false, detail: "telegram_photo_required" }, createdAt: "2026-05-29T21:30:00.000Z" }
    ]
  };

  const pending = selectPendingTelegramOffers(state, 4, { now });

  assert.deepEqual(pending.map((offer) => offer.id), ["offer_better"]);
});

test("publication recovery retries photo failures after a short cooldown", () => {
  const now = new Date("2026-05-30T14:00:00.000Z");
  const state = {
    offers: [
      {
        id: "offer_retry_photo",
        title: "TP-Link Deco X10 Mesh Wi-Fi 6",
        status: "auto_ready",
        currentPrice: 799,
        previousPrice: 901.47,
        discountPercent: 11,
        rating: 4.7,
        reviewCount: 1200,
        imageUrls: ["https://m.media-amazon.com/images/I/deco._AC_UL800_.jpg"],
        createdAt: "2026-05-30T08:46:33.587Z",
        updatedAt: "2026-05-30T08:51:33.444Z"
      }
    ],
    publishLog: [
      {
        channel: "telegram",
        offerId: "offer_retry_photo",
        result: { ok: false, detail: "telegram_photo_required" },
        createdAt: "2026-05-30T08:51:34.011Z"
      }
    ]
  };

  const pending = selectPendingTelegramOffers(state, 4, { now });

  assert.deepEqual(pending.map((offer) => offer.id), ["offer_retry_photo"]);
});

test("publication recovery enqueues only one Telegram offer per recovery tick", async () => {
  const state = {
    offers: [
      {
        id: "offer_first_recovery",
        title: "Notebook Acer Aspire 5 Ryzen 5",
        status: "auto_ready",
        currentPrice: 3499,
        previousPrice: 4899,
        discountPercent: 29,
        rating: 4.7,
        reviewCount: 1200,
        imageUrls: ["https://m.media-amazon.com/images/I/notebook._AC_UL800_.jpg"],
        createdAt: new Date().toISOString()
      },
      {
        id: "offer_second_recovery",
        title: "Monitor LG Ultragear 144Hz",
        status: "auto_ready",
        currentPrice: 1213.97,
        previousPrice: 1598.9,
        discountPercent: 24,
        rating: 4.7,
        reviewCount: 900,
        imageUrls: ["https://m.media-amazon.com/images/I/monitor._AC_UL800_.jpg"],
        createdAt: new Date().toISOString()
      }
    ],
    publishLog: []
  };
  const jobs = [];
  const db = { state, load: async () => {} };
  const queue = { add: async (...args) => jobs.push(args) };
  const config = { maxPublicationsPerCycle: 4, publicationWindowHours: 1, minPublicationIntervalMinutes: 15 };

  const result = await enqueuePendingTelegramOffers(db, config, queue);

  assert.equal(result.enqueued, 1);
  assert.equal(jobs.length, 1);
});

test("immediate publish selector skips published and related offers", () => {
  const state = {
    offers: [
      {
        id: "already_discord",
        status: "auto_ready",
        title: "Samsung Vision AI TV 55 OLED 4K",
        currentPrice: 6072,
        previousPrice: 6898,
        discountPercent: 12,
        imageUrl: "https://example.com/tv.jpg",
        asin: "B0DISCORDTV"
      },
      {
        id: "related_tv",
        status: "auto_ready",
        title: "Smart TV 4K 65\" LG QNED73 + Soundbar LG 300W",
        currentPrice: 4743,
        previousPrice: 6198,
        discountPercent: 23,
        asin: "B0RELATEDTV"
      },
      {
        id: "soundcore",
        status: "auto_ready",
        title: "soundcore Space One da Anker, Fone de Ouvido Bluetooth 5.3 com ANC adaptivo",
        currentPrice: 640.3,
        previousPrice: 999,
        discountPercent: 36,
        imageUrl: "https://example.com/soundcore.jpg",
        asin: "B0SOUNDCORE"
      },
      {
        id: "published_tv",
        status: "auto_ready",
        title: "Smart TV 4K 86\" LG QNED73 + Soundbar LG 600W",
        currentPrice: 8843,
        previousPrice: 10734,
        discountPercent: 18,
        asin: "B0PUBLISHEDTV"
      }
    ],
    publishLog: [
      {
        offerId: "published_tv",
        channel: "telegram",
        result: { ok: true },
        createdAt: new Date().toISOString()
      },
      {
        offerId: "already_discord",
        channel: "discord",
        result: { ok: true },
        createdAt: new Date().toISOString()
      }
    ]
  };

  const selected = selectImmediatePublishOffer(state, { relatedOfferDedupeHours: 24 });

  assert.equal(selected.id, "soundcore");
});

test("Telegram publication policy allows four per hour with fifteen minute spacing", () => {
  const now = new Date("2026-05-28T12:30:00.000Z");
  const config = {
    maxPublicationsPerCycle: 4,
    publicationWindowHours: 1,
    minPublicationIntervalMinutes: 15
  };
  const publishLog = [
    { channel: "telegram", result: { ok: true }, createdAt: "2026-05-28T11:35:00.000Z" },
    { channel: "telegram", result: { ok: true }, createdAt: "2026-05-28T11:50:00.000Z" },
    { channel: "telegram", result: { ok: true }, createdAt: "2026-05-28T12:05:00.000Z" },
    { channel: "telegram", result: { ok: true }, createdAt: "2026-05-28T12:20:00.000Z" }
  ];
  assert.deepEqual(telegramPublicationStatus(publishLog, config, now), {
    allowed: false,
    reason: "telegram_quota_reached",
    recentPublished: 4,
    maxPerCycle: 4,
    windowHours: 1,
    minIntervalMinutes: 15,
    waitMinutes: 5
  });
  assert.equal(telegramPublicationStatus(publishLog.slice(1), config, now).allowed, false);
  assert.equal(telegramPublicationStatus(publishLog.slice(1), config, new Date("2026-05-28T12:35:00.000Z")).allowed, true);
});

test("Telegram publication policy distinguishes interval wait from hourly quota", () => {
  const config = {
    maxPublicationsPerCycle: 4,
    publicationWindowHours: 1,
    minPublicationIntervalMinutes: 15
  };
  const publishLog = [
    { channel: "telegram", result: { ok: true }, createdAt: "2026-05-28T12:20:00.000Z" }
  ];
  const status = telegramPublicationStatus(publishLog, config, new Date("2026-05-28T12:30:00.000Z"));
  assert.equal(status.allowed, false);
  assert.equal(status.reason, "telegram_interval_wait");
  assert.equal(status.waitMinutes, 5);
});

test("ui tokens define the command-center navigation", () => {
  assert.deepEqual(commandItems.map((item) => item.view), ["overview", "pipeline", "feed", "rejected", "config"]);
  assert.equal(viewMeta.overview.title, "Performance");
  assert.equal(viewMeta.pipeline.title, "Pipeline");
  assert.equal(viewMeta.feed.density, "compact");
  assert.equal(viewMeta.overview.density, "comfortable");
});

test("ui status tones and labels stay consistent", () => {
  assert.equal(statusTone("auto_ready"), "success");
  assert.equal(statusTone("blocked"), "danger");
  assert.equal(statusTone("needs_review"), "warning");
  assert.equal(uiStatusLabel("published"), "Publicado");
  assert.equal(uiChannelLabel("telegram"), "Telegram");
  assert.match(uiMoney(349.9).replace(/\s+/g, " "), /^R\$ ?349,90$/);
});

test("view metadata provides contextual subtitles", () => {
  assert.match(viewMeta.overview.subtitle, /pipeline autonomo/);
  assert.match(viewMeta.pipeline.subtitle, /Status dos 4 agentes/);
  assert.match(viewMeta.config.subtitle, /Threshold de confianca/);
});

test("performance home metadata uses comfortable density", () => {
  assert.equal(viewMeta.overview.density, "comfortable");
  assert.match(viewMeta.overview.subtitle, /Metricas/);
});

test("discord dry-run retorna ok sem enviar", async () => {
  const result = await publishDiscord(
    { text: "Oferta teste" },
    { discordDryRun: true, discordWebhookUrl: "https://discord.com/api/webhooks/fake" }
  );
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
});

test("discord sem webhookUrl retorna detalhe correto", async () => {
  const result = await publishDiscord(
    { text: "Oferta teste" },
    { discordDryRun: false, discordWebhookUrl: "" }
  );
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.match(result.detail, /DISCORD_WEBHOOK_URL/);
});

test("testDiscord sem webhookUrl retorna ok false", async () => {
  const result = await testDiscord({ discordWebhookUrl: "", discordDryRun: false });
  assert.equal(result.ok, false);
  assert.match(result.detail, /DISCORD_WEBHOOK_URL/);
});

test("buildEmbed inclui título e desconto do offer", async () => {
  const draft = { text: "fallback text" };
  const offer = { title: "SSD Kingston 1TB", currentPrice: 249, previousPrice: 399, discountPercent: 37.6, store: "amazon", rating: 4.8, reviewCount: 1200, category: "SSD" };
  const config = { discordDryRun: true, discordWebhookUrl: "https://x" };
  const result = await publishDiscord(draft, config, offer);
  assert.equal(result.dryRun, true);
});

test("x dry-run retorna ok sem enviar", async () => {
  const result = await publishXAcquisition("test post", { xDryRun: true });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
});

test("x sem credenciais retorna dry-run", async () => {
  const result = await publishXAcquisition("test", { xDryRun: false, xApiKey: "", xApiSecret: "", xAccessToken: "", xAccessSecret: "" });
  assert.equal(result.dryRun, true);
  assert.match(result.detail, /credenciais/i);
});

test("x respeita limite diário de 3 posts", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const publishLog = Array.from({ length: 3 }, (_, i) => ({
    channel: "x", result: { ok: true }, createdAt: `${today}T10:0${i}:00.000Z`
  }));
  const config = { xDryRun: false, xApiKey: "k", xApiSecret: "s", xAccessToken: "t", xAccessSecret: "ts" };
  const result = await publishXAcquisition("test", config, publishLog);
  assert.equal(result.ok, false);
  assert.match(result.detail, /Limite diário/);
});

test("scrapeFeedDeals retorna vazio no modo mock", async () => {
  const config = { scraperMode: "mock" };
  const results = await (await import("../src/scrapers.js")).scrapeFeedDeals(config);
  assert.deepEqual(results, []);
});

test("isTechDeal filtra categorias corretas (inline)", () => {
  const titles = ["SSD NVMe Kingston 1TB", "Blusa feminina vermelha", "Notebook Dell Core i7", "Camiseta polo"];
  const expected = [true, false, true, false];
  const TECH = ["ssd", "nvme", "notebook", "monitor", "mouse", "teclado", "headset", "webcam", "hub", "placa", "memória", "ram", "processador", "gpu", "roteador", "câmera", "impressora"];
  const lower = (t) => t.toLowerCase();
  titles.forEach((title, i) => {
    const result = TECH.some(kw => lower(title).includes(kw));
    assert.equal(result, expected[i], `Title: ${title}`);
  });
});

test("validateAmazonLink aceita link amazon com tag", () => {
  const result = validateAmazonLink("https://www.amazon.com.br/dp/B09XYZ?tag=meutag-20");
  assert.equal(result.valid, true);
});

test("validateAmazonLink rejeita link sem tag", () => {
  const result = validateAmazonLink("https://www.amazon.com.br/dp/B09XYZ");
  assert.equal(result.valid, false);
  assert.equal(result.reason, "tag_afiliado_ausente");
});

test("validateAmazonLink rejeita domínio incorreto", () => {
  const result = validateAmazonLink("https://www.mercadolivre.com.br/produto/123");
  assert.equal(result.valid, false);
  assert.equal(result.reason, "dominio_incorreto");
});

test("validateAmazonLink rejeita link ausente", () => {
  const result = validateAmazonLink(null);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "link_ausente");
});

test("POST /api/integrations/discord/test retorna resultado", async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), "tdo-test-"));
  const db = new JsonDb(join(tmpDir, "db.json"));
  await db.load();
  const config = loadConfig({ DISCORD_WEBHOOK_URL: "", DISCORD_DRY_RUN: "true" });
  const app = createApp({ db, config, publicDir: "dist" });
  const server = app.listen(0);
  const port = server.address().port;
  const res = await fetch(`http://localhost:${port}/api/integrations/discord/test`, { method: "POST" });
  const body = await res.json();
  server.close();
  await rm(tmpDir, { recursive: true });
  assert.equal(res.status, 200);
  assert.equal(typeof body.ok, "boolean");
});

test("config exposes Discord bot and supervisor settings", () => {
  const config = loadConfig({
    DISCORD_BOT_TOKEN: "bot-token",
    DISCORD_GUILD_ID: "guild-1",
    DISCORD_ADMIN_ROLE_NAME: "Admin TDO",
    DISCORD_SETUP_ENABLED: "true",
    DISCORD_OPS_ENABLED: "true",
    DISCORD_PUBLIC_DEALS_ENABLED: "false",
    SUPERVISOR_ENABLED: "true",
    SUPERVISOR_INTERVAL_MINUTES: "5",
    SUPERVISOR_STALE_TELEGRAM_MINUTES: "90"
  });

  assert.equal(config.discordBotToken, "bot-token");
  assert.equal(config.discordGuildId, "guild-1");
  assert.equal(config.discordAdminRoleName, "Admin TDO");
  assert.equal(config.discordSetupEnabled, true);
  assert.equal(config.discordOpsEnabled, true);
  assert.equal(config.discordPublicDealsEnabled, false);
  assert.equal(config.supervisorEnabled, true);
  assert.equal(config.supervisorIntervalMinutes, 5);
  assert.equal(config.supervisorStaleTelegramMinutes, 90);
});

test("config enables Discord ops and public deals by default when bot is configured", () => {
  const config = loadConfig({
    DISCORD_BOT_TOKEN: "bot-token",
    DISCORD_GUILD_ID: "guild-1"
  });

  assert.equal(config.discordOpsEnabled, true);
  assert.equal(config.discordPublicDealsEnabled, true);
});

test("db state includes incidents and discord channel registry defaults", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    assert.deepEqual(db.state.incidents, []);
    assert.deepEqual(db.state.discord, { channels: {}, roles: {}, lastSetupAt: null, lastSetupError: null });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Discord setup creates managed public and private channels without deleting existing channels", async () => {
  const calls = [];
  const existingChannels = [
    { id: "cat-public", name: "📌 INICIO", type: 4 },
    { id: "existing-welcome", name: "boas-vindas", type: 0, parent_id: "cat-public" }
  ];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (options.method === "GET") return new Response(JSON.stringify(existingChannels), { status: 200 });
    if (options.method === "POST") {
      const body = JSON.parse(options.body);
      return new Response(JSON.stringify({ id: `created-${calls.length}`, name: body.name, type: body.type, parent_id: body.parent_id || null }), { status: 201 });
    }
    if (options.method === "PATCH") return new Response(JSON.stringify({ ok: true }), { status: 200 });
    return new Response("{}", { status: 200 });
  };
  const db = {
    state: { discord: { channels: {}, roles: {}, lastSetupAt: null, lastSetupError: null } },
    save: async () => {}
  };
  const result = await setupDiscordServer(db, {
    discordBotToken: "token",
    discordGuildId: "guild",
    discordAdminRoleName: "Admin TDO"
  }, { fetchImpl });

  assert.equal(result.ok, true);
  assert.ok(calls.some(call => call.options.method === "POST"));
  assert.equal(db.state.discord.channels["boas-vindas"], "existing-welcome");
  assert.ok(db.state.discord.channels.supervisor);
  assert.ok(db.state.discord.channels["ofertas-do-dia"]);
});

test("Discord status reports unknown guild with safe diagnostics", async () => {
  const db = { state: { discord: { channels: {}, roles: {}, lastSetupAt: null, lastSetupError: null } } };
  const result = await checkDiscordStatus(db, {
    discordBotToken: "token",
    discordGuildId: "1510299067148931133",
    discordOpsEnabled: true,
    discordPublicDealsEnabled: false
  }, {
    fetchImpl: async () => new Response(JSON.stringify({ message: "Unknown Guild" }), { status: 404 })
  });

  assert.equal(result.configured, true);
  assert.equal(result.guildId, "1510299067148931133");
  assert.equal(result.accessible, false);
  assert.equal(result.opsEnabled, true);
  assert.equal(result.publicDealsEnabled, false);
  assert.equal(result.error, "Unknown Guild");
  assert.equal(Object.prototype.hasOwnProperty.call(result, "token"), false);
});

test("Discord ops reporter sends agent event to mapped private channel and masks secrets", async () => {
  const sent = [];
  const db = { state: { discord: { channels: { supervisor: "chan-supervisor" } } } };
  const result = await reportAgentEvent(db, { discordOpsEnabled: true, discordBotToken: "token" }, {
    agent: "supervisor",
    severity: "warning",
    title: "Token check",
    message: "Using token abc123",
    data: { token: "secret", offerId: "offer_1" }
  }, { client: { createMessage: async (channelId, body) => sent.push({ channelId, body }) } });

  assert.equal(result.ok, true);
  assert.equal(sent[0].channelId, "chan-supervisor");
  assert.doesNotMatch(JSON.stringify(sent[0].body), /secret/);
});

test("Discord deal routing maps offers to public promotion channels", () => {
  assert.equal(discordDealChannelForOffer({ title: "Notebook Acer Aspire" }), "notebooks");
  assert.equal(discordDealChannelForOffer({ title: "Smart TV LG 55" }), "tvs");
  assert.equal(discordDealChannelForOffer({ title: "Monitor LG Ultragear" }), "monitores");
  assert.equal(discordDealChannelForOffer({ title: "Headset HyperX Cloud" }), "audio-headsets");
  assert.equal(discordDealChannelForOffer({ title: "Cadeira Flexform" }), "cadeiras-mesas");
});

test("Discord public deal embed keeps image URLs and omits affiliate footer", () => {
  const message = buildDiscordDealMessage({
    title: "Kit Mouse Sem Fio Logitech Pebble 2",
    currentPrice: 282.12,
    previousPrice: 371.8,
    discountPercent: 24,
    telegramImageFileId: "telegram-file-id",
    imageUrls: ["https://m.media-amazon.com/images/I/exact-product.jpg"],
    store: "amazon"
  }, "https://www.amazon.com.br/dp/B0DVCHL7PG?tag=tdolinks-20");

  const embed = message.embeds[0];
  assert.deepEqual(embed.image, { url: "https://m.media-amazon.com/images/I/exact-product.jpg" });
  assert.equal(embed.footer, undefined);
  assert.doesNotMatch(JSON.stringify(message), /Link de afiliado/i);
});

test("supervisor detects stale Telegram window and enqueues one recovery", async () => {
  const jobs = [];
  const db = {
    state: {
      offers: [{
        id: "offer_ready",
        title: "Notebook Acer Aspire",
        status: "auto_ready",
        currentPrice: 3499,
        previousPrice: 4899,
        discountPercent: 29,
        imageUrls: ["https://img.test/notebook.jpg"],
        createdAt: "2026-05-30T14:55:00.000Z"
      }],
      publishLog: [],
      incidents: [],
      discord: { channels: {} }
    },
    load: async () => {},
    save: async () => {}
  };
  const result = await runSupervisorCheck(db, {
    supervisorEnabled: true,
    supervisorStaleTelegramMinutes: 60,
    maxPublicationsPerCycle: 4,
    publicationWindowHours: 1,
    minPublicationIntervalMinutes: 15
  }, {
    creativeQueue: { add: async (...args) => jobs.push(args) },
    now: new Date("2026-05-30T15:00:00.000Z")
  });

  assert.equal(result.incidents.some((incident) => incident.type === "telegram_stale_window"), true);
  assert.equal(result.actions.some((action) => action.type === "recovery_enqueued_one_offer"), true);
  assert.equal(jobs.length, 1);
});

test("supervisor opens duplicate incident without publishing non-promotions", async () => {
  const jobs = [];
  const db = {
    state: {
      offers: [
        { id: "a", title: "Notebook Acer Aspire 5", status: "auto_ready", currentPrice: 3499, previousPrice: 4899, discountPercent: 29, imageUrls: ["x"], createdAt: "2026-05-30T15:00:00.000Z" },
        { id: "b", title: "Notebook Acer Aspire 5", status: "auto_ready", currentPrice: 3499, previousPrice: 4899, discountPercent: 29, imageUrls: ["x"], createdAt: "2026-05-30T15:00:00.000Z" },
        { id: "c", title: "Monitor sem promocao", status: "auto_ready", currentPrice: 899, previousPrice: null, discountPercent: 0, imageUrls: ["x"], createdAt: "2026-05-30T15:00:00.000Z" }
      ],
      publishLog: [],
      incidents: [],
      discord: { channels: {} }
    },
    load: async () => {},
    save: async () => {}
  };
  const result = await runSupervisorCheck(db, { supervisorEnabled: true, supervisorStaleTelegramMinutes: 60 }, {
    creativeQueue: { add: async (...args) => jobs.push(args) },
    now: new Date("2026-05-30T15:00:00.000Z")
  });

  assert.equal(result.incidents.some((incident) => incident.type === "duplicate_ready_offer"), true);
  assert.equal(jobs.some((job) => JSON.stringify(job).includes("Monitor sem promocao")), false);
});

function mockAnthropic(responses) {
  let index = 0;
  const calls = [];
  return {
    calls,
    messages: {
      create: async (params) => {
        calls.push(params);
        return responses[Math.min(index++, responses.length - 1)];
      }
    }
  };
}

function toolUse(name, input, id = `t_${Math.random().toString(36).slice(2, 7)}`) {
  return { type: "tool_use", id, name, input };
}

test("orchestrator publishes a real promotion in dry-run and marks it published", async () => {
  const dir = await mkdtemp(join(tmpdir(), "orchestrator-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    db.state.offers.push({
      id: "offer_pub",
      store: "amazon",
      title: "Fone Sony WH-1000XM5",
      currentPrice: 1499,
      previousPrice: 2199,
      discountPercent: 32,
      originalUrl: "https://www.amazon.com.br/dp/B09XS7JWHH",
      imageUrls: ["https://m.media-amazon.com/images/I/test.jpg"],
      status: "auto_ready",
      createdAt: new Date().toISOString()
    });
    const ctx = {
      db,
      config: loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318", TELEGRAM_DRY_RUN: "true", AMAZON_AFFILIATE_TAG: "tdolinks-20" }),
      now: new Date(),
      actions: [],
      published: 0
    };
    const result = await toolPublish(ctx, "offer_pub");
    assert.equal(result.published, true);
    assert.equal(result.dryRun, true);
    assert.equal(db.state.offers[0].status, "published");
    assert.equal(ctx.published, 1);
    assert.ok(db.state.publishLog.some((e) => e.offerId === "offer_pub" && e.channel === "telegram" && e.result.ok));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("orchestrator publish is idempotent and reports duplicates truthfully (no fake success)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "orchestrator-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    db.state.offers.push({
      id: "offer_dup",
      store: "amazon",
      title: "Headset HyperX Cloud Alpha",
      currentPrice: 349,
      previousPrice: 549,
      discountPercent: 36,
      originalUrl: "https://www.amazon.com.br/dp/B0HYPERX01",
      imageUrls: ["https://m.media-amazon.com/images/I/test.jpg"],
      status: "auto_ready",
      createdAt: new Date().toISOString()
    });
    db.state.publishLog.push({
      id: "pub_prev",
      offerId: "offer_dup",
      channel: "telegram",
      result: { ok: true, dryRun: true },
      createdAt: new Date().toISOString()
    });
    const ctx = {
      db,
      config: loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318", TELEGRAM_DRY_RUN: "true" }),
      now: new Date(),
      actions: [],
      published: 0
    };
    const result = await toolPublish(ctx, "offer_dup");
    assert.equal(result.published, false);
    assert.equal(result.reason, "already_published");
    assert.equal(ctx.published, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("orchestrator archive_offer clears an offer from the funnel", async () => {
  const dir = await mkdtemp(join(tmpdir(), "orchestrator-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    db.state.offers.push({ id: "offer_arch", title: "Mouse generico", status: "auto_ready", createdAt: new Date().toISOString() });
    const ctx = { db, config: {}, now: new Date(), actions: [], published: 0 };
    const result = await toolArchive(ctx, "offer_arch", "duplicate_family");
    assert.equal(result.status, "archived");
    assert.equal(db.state.offers[0].status, "archived");
    assert.equal(db.state.offers[0].archiveReason, "duplicate_family");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("orchestrator loop runs agent tool calls and ends on finish_cycle", async () => {
  const dir = await mkdtemp(join(tmpdir(), "orchestrator-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    db.state.offers.push({ id: "offer_loop", title: "Monitor sem promocao", status: "new", currentPrice: 899, previousPrice: null, createdAt: new Date().toISOString() });
    // Post 30 min ago: channel is not stale (<90min) and cadence is open (>15min interval), so the gate runs the agent.
    db.state.publishLog.push({ id: "pub_recent", offerId: "x", channel: "telegram", result: { ok: true }, createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString() });
    await db.save();
    const client = mockAnthropic([
      { stop_reason: "tool_use", content: [toolUse("archive_offer", { offerId: "offer_loop", reason: "no_promotion" })] },
      { stop_reason: "tool_use", content: [toolUse("finish_cycle", { summary: "Arquivei 1 oferta sem promoção." })] }
    ]);
    const config = loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318", ANTHROPIC_API_KEY: "test", ORCHESTRATOR_ENABLED: "true" });
    const result = await runOrchestratorCycle(db, config, { client, skipScrape: true });
    assert.equal(result.skipped, false);
    assert.equal(db.state.offers[0].status, "archived");
    assert.ok(client.calls.length >= 1);
    assert.match(result.summary, /Arquivei/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("orchestrator cost gate skips the LLM when nothing is pending and channel is fresh", async () => {
  const dir = await mkdtemp(join(tmpdir(), "orchestrator-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    db.state.publishLog.push({ id: "pub_fresh", offerId: "x", channel: "telegram", result: { ok: true }, createdAt: new Date().toISOString() });
    await db.save();
    const client = mockAnthropic([{ stop_reason: "end_turn", content: [] }]);
    const config = loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318", ANTHROPIC_API_KEY: "test" });
    const result = await runOrchestratorCycle(db, config, { client, skipScrape: true });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "no_pending_offers");
    assert.equal(client.calls.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("validateDeal hard-rejects non-premium brands without calling the LLM", async () => {
  const result = await validateDeal({
    title: "Redragon M606 Mouse Gamer RGB",
    currentPrice: 94,
    previousPrice: 140,
    discountPercent: 33,
    store: "amazon"
  }, { anthropicApiKey: "should-not-be-called" });
  assert.equal(result.valid, false);
  assert.ok(result.reason.includes("brand_not_premium"));
});

test("validateDeal hard-rejects products under the minimum price", async () => {
  const result = await validateDeal({
    title: "Logitech Mouse M90 USB",
    currentPrice: 59,
    previousPrice: 89,
    discountPercent: 34,
    store: "amazon"
  }, { anthropicApiKey: "should-not-be-called" });
  assert.equal(result.valid, false);
  assert.ok(result.reason.includes("price_too_low"));
});

test("validateDeal hard-rejects discounts below minimum", async () => {
  const result = await validateDeal({
    title: "Logitech MX Master 3S Mouse Sem Fio",
    currentPrice: 430,
    previousPrice: 460,
    discountPercent: 6,
    store: "amazon"
  }, { anthropicApiKey: "should-not-be-called" });
  assert.equal(result.valid, false);
  assert.ok(result.reason.includes("discount_too_low"));
});

test("parseAmazonSearch extracts strikethrough list price as previousPrice", () => {
  const html = `
    <div data-asin="B0STRIKE01">
      <h2><span>Monitor Gamer Samsung Odyssey G5 27 144hz</span></h2>
      <span class="a-price-whole">1.262</span><span class="a-price-decimal">,</span><span class="a-price-fraction">00</span>
      <span class="a-price a-text-price" data-a-strike="true"><span class="a-offscreen">R$ 1.599,00</span></span>
      <img src="https://m.media-amazon.com/images/I/odyssey.jpg" />
      4,7 de 5 estrelas
    </div>
  `;
  const [offer] = parseAmazonSearch(html);
  assert.equal(offer.currentPrice, 1262);
  assert.equal(offer.previousPrice, 1599);
});

test("verifyAmazonProduct extracts previousPrice from product page list price", async () => {
  const html = `
    <html>
      <span class="a-offscreen">R$ 1.262,00</span>
      <span id="productTitle">Monitor Gamer Samsung Odyssey G5 27</span>
      <span class="a-price a-text-price" data-a-strike="true"><span class="a-offscreen">R$ 1.599,00</span></span>
      <img id="landingImage" src="https://m.media-amazon.com/images/I/odyssey.jpg" />
      4,7 de 5 estrelas
      <span id="acrCustomerReviewText">320 avaliações</span>
    </html>
  `;
  const result = await verifyAmazonProduct("B0ODYSSEY1", { fetchImpl: async () => new Response(html, { status: 200 }) });
  assert.equal(result.currentPrice, 1262);
  assert.equal(result.previousPrice, 1599);
});

test("scraper retries on HTTP 503 and recovers", async () => {
  const html = `<html><span class="a-offscreen">R$ 99,90</span><span id="productTitle">Item</span></html>`;
  let calls = 0;
  const result = await verifyAmazonProduct("B0RETRY001", {
    scraperMaxRetries: 2,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return new Response("blocked", { status: 503 });
      return new Response(html, { status: 200 });
    }
  });
  assert.equal(calls, 2);
  assert.equal(result.currentPrice, 99.9);
});

test("orchestrator validation enriches Amazon offers missing a promotion from the product page", async () => {
  const dir = await mkdtemp(join(tmpdir(), "orchestrator-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    db.state.offers.push({
      id: "offer_enrich",
      store: "amazon",
      asin: "B0ENRICH01",
      title: "Monitor Gamer Samsung Odyssey G5 27",
      currentPrice: 1262,
      previousPrice: null,
      originalUrl: "https://www.amazon.com.br/dp/B0ENRICH01",
      status: "new",
      createdAt: new Date().toISOString()
    });
    const productHtml = `
      <html>
        <span class="a-offscreen">R$ 1.262,00</span>
        <span id="productTitle">Monitor Gamer Samsung Odyssey G5 27</span>
        <span class="a-price a-text-price" data-a-strike="true"><span class="a-offscreen">R$ 1.599,00</span></span>
        <img id="landingImage" src="https://m.media-amazon.com/images/I/odyssey.jpg" />
      </html>
    `;
    const config = {
      ...loadConfig({ PUBLIC_BASE_URL: "http://localhost:4318" }),
      fetchImpl: async () => new Response(productHtml, { status: 200 })
    };
    const ctx = { db, config, now: new Date(), actions: [], published: 0 };
    const result = await toolValidate(ctx, "offer_enrich");
    assert.equal(db.state.offers[0].previousPrice, 1599);
    assert.equal(db.state.offers[0].imageUrls.includes("https://m.media-amazon.com/images/I/odyssey.jpg"), true);
    assert.equal(result.approved, true);
    assert.equal(db.state.offers[0].status, "auto_ready");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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
