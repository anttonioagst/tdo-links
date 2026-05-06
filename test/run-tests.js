import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDraftsForOffer, runPublishPipeline, runScrapePipeline } from "../src/agents.js";
import { validatePost, validateXAcquisitionPost } from "../src/compliance.js";
import { loadConfig } from "../src/config.js";
import { JsonDb } from "../src/db.js";
import { buildAffiliateUrl } from "../src/links.js";
import { createApp } from "../src/server.js";
import { dedupeOffers, scoreOffer, statusForScore } from "../src/scoring.js";
import { parseAmazonSearch } from "../src/scrapers.js";

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

test("scrape to draft to publish dry-run pipeline", async () => {
  const dir = await mkdtemp(join(tmpdir(), "affiliate-mvp-"));
  try {
    const db = new JsonDb(join(dir, "db.json"));
    await db.load();
    const config = loadConfig({
      PORT: "4318",
      PUBLIC_BASE_URL: "http://localhost:4318",
      TELEGRAM_DRY_RUN: "true",
      X_DRY_RUN: "true"
    });
    const scrape = await runScrapePipeline(db, config);
    assert.equal(scrape.inserted, 3);
    assert.ok(db.state.drafts.some((draft) => draft.channel === "telegram"));

    const publish = await runPublishPipeline(db, config);
    assert.ok(publish.published >= 1);
    assert.ok(db.state.drafts.some((draft) => draft.status === "published"));
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

function request(app, { method = "GET", path = "/", body = null }) {
  return new Promise((resolve, reject) => {
    app.listen(0, "127.0.0.1", () => {
      const { port } = app.address();
      const payload = body ? JSON.stringify(body) : "";
      const req = globalThis.fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { "content-type": "application/json" },
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
