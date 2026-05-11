# TDO Links Premium Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 premium affiliate operations cockpit: real Amazon-focused candidate handling, explicit validation, reliable Telegram diagnostics, compound scoring, actionable recommendations, and useful premium dashboard tabs.

**Architecture:** Keep the current Node HTTP server, JSON store, and React admin foundation. Add small backend modules for validation, diagnostics, recommendations, and score breakdowns instead of expanding `agents.js` further. Upgrade the React app in-place while preserving existing API patterns and tests.

**Tech Stack:** Node.js 20 ESM, React 19, Vite, Tailwind CSS, local JSON persistence, native `fetch`, Node `assert` tests.

---

## File Structure

- Create `src/validation.js`: offer validation status, reasons, summaries, and publishability gates.
- Create `src/recommendations.js`: deterministic operational recommendations from current state.
- Create `src/integrations.js`: integration diagnostics and Telegram test result helpers.
- Modify `src/scoring.js`: keep `scoreOffer`, add `scoreOfferDetailed`, and make the score explainable.
- Modify `src/scrapers.js`: return source metadata and make mock fallback explicit.
- Modify `src/agents.js`: call validation/scoring/recommendations, improve publish result detail, store last publish attempts.
- Modify `src/server.js`: add diagnostics/test/manual/validate/recommendation APIs and return richer state.
- Modify `src/db.js`: add default `integrations`, `recommendations`, and `campaigns` state.
- Modify `src/publishers/telegram.js`: expose a test helper and normalize provider errors.
- Modify `client/src/App.jsx`: rename generic dashboard content, add operational health, validation/status displays, and useful reports/configuration sections.
- Modify `test/run-tests.js`: add tests for validation, score breakdown, diagnostics, detailed publish results, scrape metadata, manual offers, and recommendations.

---

### Task 1: Integration Diagnostics and Detailed Publish Results

**Files:**
- Create: `src/integrations.js`
- Modify: `src/publishers/telegram.js`
- Modify: `src/agents.js`
- Modify: `src/server.js`
- Test: `test/run-tests.js`

- [ ] **Step 1: Write failing tests for diagnostics and publish detail**

Add these imports near the top of `test/run-tests.js`:

```js
import { buildDiagnostics } from "../src/integrations.js";
```

Add these tests before the test runner loop:

```js
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
      X_DRY_RUN: "true"
    });
    await runScrapePipeline(db, config);
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
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm test
```

Expected: failure because `../src/integrations.js` does not exist and `runPublishPipeline()` does not return `results`.

- [ ] **Step 3: Create diagnostics module**

Create `src/integrations.js`:

```js
export function buildDiagnostics({ config, state }) {
  const lastTelegramAttempt = (state.publishLog || []).find((item) => item.channel === "telegram") || null;
  const missing = [];
  if (!config.telegramBotToken) missing.push("bot_token");
  if (!config.telegramChatId) missing.push("chat_id");
  return {
    publicBaseUrl: config.publicBaseUrl,
    generatedAt: new Date().toISOString(),
    telegram: {
      dryRun: config.telegramDryRun,
      hasBotToken: Boolean(config.telegramBotToken),
      hasChatId: Boolean(config.telegramChatId),
      ready: missing.length === 0,
      missing,
      lastAttempt: lastTelegramAttempt
    },
    x: {
      dryRun: config.xDryRun,
      profileUrl: config.xProfileUrl || "",
      ready: Boolean(config.xProfileUrl)
    },
    amazon: {
      hasDefaultTag: Boolean(config.amazonAffiliateTag),
      hasTelegramTag: Boolean(config.amazonAffiliateTagTelegram),
      hasXTag: Boolean(config.amazonAffiliateTagX),
      hasAdminTag: Boolean(config.amazonAffiliateTagAdmin),
      creatorUrl: config.amazonCreatorUrl || "",
      searchUrls: config.amazonSearchUrls || []
    },
    automation: {
      autoMode: config.autoMode,
      autoPublishThreshold: config.autoPublishThreshold,
      reviewThreshold: config.reviewThreshold,
      scrapeIntervalMinutes: config.scrapeIntervalMinutes,
      publishIntervalMinutes: config.publishIntervalMinutes
    },
    scout: {
      scraperMode: config.scraperMode,
      scraperFallbackMock: config.scraperFallbackMock
    }
  };
}

export function summarizeTelegramTest(config) {
  const missing = [];
  if (!config.telegramBotToken) missing.push("bot_token");
  if (!config.telegramChatId) missing.push("chat_id");
  if (config.telegramDryRun) missing.push("dry_run_enabled");
  return {
    ok: missing.length === 0,
    dryRun: config.telegramDryRun,
    missing,
    detail: missing.length
      ? `Telegram nao esta pronto: ${missing.join(", ")}.`
      : "Telegram configurado para envio real."
  };
}
```

- [ ] **Step 4: Normalize Telegram provider errors and add test helper**

In `src/publishers/telegram.js`, add this exported function above `publishTelegram()`:

```js
export async function testTelegram(config) {
  if (config.telegramDryRun || !config.telegramBotToken || !config.telegramChatId) {
    return {
      ok: false,
      dryRun: config.telegramDryRun,
      providerMessageId: null,
      detail: "Teste nao enviado: dry-run ativo ou credenciais ausentes."
    };
  }
  const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: config.telegramChatId,
      text: "TDO Links: teste de integracao Telegram concluido."
    })
  });
  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok && payload.ok === true,
    dryRun: false,
    providerMessageId: payload.result?.message_id || null,
    detail: payload.description || (response.ok ? "ok" : `HTTP ${response.status}`)
  };
}
```

Then in both existing `publishTelegram()` branches, change:

```js
const payload = await response.json();
```

to:

```js
const payload = await response.json().catch(() => ({}));
```

- [ ] **Step 5: Return detailed publish results**

In `src/agents.js`, change `runPublishPipeline()` to accumulate `results`.

Replace:

```js
let published = 0;
for (const draft of eligible) {
```

with:

```js
let published = 0;
const results = [];
for (const draft of eligible) {
```

Inside the loop, after `db.state.publishLog.unshift(...)`, add:

```js
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
```

Replace the final return:

```js
return { published };
```

with:

```js
return {
  published,
  failed: results.filter((item) => item.outcome === "failed").length,
  dryRun: results.filter((item) => item.dryRun).length,
  skipped: 0,
  results
};
```

Also replace the paused return:

```js
return { published: 0, skipped: "paused" };
```

with:

```js
return { published: 0, failed: 0, dryRun: 0, skipped: 1, results: [{ outcome: "skipped", reason: "paused" }] };
```

- [ ] **Step 6: Wire diagnostics and Telegram test endpoints**

In `src/server.js`, update imports:

```js
import { buildDiagnostics } from "./integrations.js";
import { testTelegram } from "./publishers/telegram.js";
```

Replace the current `/api/diagnostics` response block with:

```js
sendJson(res, 200, buildDiagnostics({ config, state: db.state }));
return;
```

Add this route after `/api/diagnostics`:

```js
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
```

- [ ] **Step 7: Run tests and commit**

Run:

```powershell
npm test
```

Expected: all tests pass.

Commit:

```powershell
git add src/integrations.js src/publishers/telegram.js src/agents.js src/server.js test/run-tests.js
git commit -m "feat: add integration diagnostics and publish results"
```

---

### Task 2: Offer Validation and Compound Score Breakdown

**Files:**
- Create: `src/validation.js`
- Modify: `src/scoring.js`
- Modify: `src/agents.js`
- Modify: `src/server.js`
- Test: `test/run-tests.js`

- [ ] **Step 1: Write failing tests for validation and score breakdown**

Add imports:

```js
import { validateOffer } from "../src/validation.js";
import { scoreOfferDetailed } from "../src/scoring.js";
```

Add tests:

```js
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
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm test
```

Expected: failure because `validation.js` and `scoreOfferDetailed()` do not exist.

- [ ] **Step 3: Create validation module**

Create `src/validation.js`:

```js
import { hasAffiliateConfig } from "./links.js";

const MAX_PRICE_AGE_HOURS = 24;

export function validateOffer(offer, config, now = new Date()) {
  const reasons = [];
  const warnings = [];
  const scrapedAt = offer.scrapedAt ? new Date(offer.scrapedAt) : null;
  const priceAgeHours = scrapedAt && !Number.isNaN(scrapedAt.getTime())
    ? (now.getTime() - scrapedAt.getTime()) / 3_600_000
    : Infinity;

  const affiliateReady = Boolean(offer.affiliateReady || hasAffiliateConfig(offer, config));
  if (!affiliateReady) reasons.push("affiliate_not_ready");
  if (!offer.currentPrice || Number(offer.currentPrice) <= 0) reasons.push("missing_price");
  if (priceAgeHours > MAX_PRICE_AGE_HOURS) warnings.push("price_stale");
  if (offer.inStock === false) reasons.push("out_of_stock");
  if (offer.store === "amazon" && offer.affiliateSource !== "manual" && !hasAffiliateConfig(offer, config)) {
    reasons.push("amazon_manual_link_required");
  }
  if (!offer.imageUrl && !(offer.imageUrls || []).length) warnings.push("missing_image");
  if (offer.source === "mock") warnings.push("mock_source");

  const blocked = reasons.length > 0;
  const needsReview = !blocked && warnings.length > 0;
  const validationStatus = blocked ? "blocked" : needsReview ? "needs_review" : "ready";
  return {
    validationStatus,
    validationReasons: [...reasons, ...warnings],
    validationSummary: summaryFor(validationStatus, reasons, warnings),
    priceValidatedAt: offer.currentPrice ? now.toISOString() : offer.priceValidatedAt || null,
    affiliateValidatedAt: affiliateReady ? now.toISOString() : offer.affiliateValidatedAt || null,
    publishable: validationStatus === "ready",
    affiliateReady
  };
}

function summaryFor(status, reasons, warnings) {
  if (status === "ready") return "Oferta pronta para publicacao semi-automatica.";
  if (reasons.includes("affiliate_not_ready")) return "Configure um link afiliado oficial antes de publicar.";
  if (reasons.includes("missing_price")) return "Preco ausente ou invalido.";
  if (reasons.includes("out_of_stock")) return "Produto indisponivel.";
  if (warnings.includes("price_stale")) return "Preco antigo; revise antes de publicar.";
  if (warnings.includes("mock_source")) return "Oferta veio de mock; nao publique sem validar.";
  if (warnings.includes("missing_image")) return "Oferta sem imagem; revise o card antes de publicar.";
  return "Oferta precisa de revisao.";
}

export function applyValidation(offer, config, now = new Date()) {
  return {
    ...offer,
    ...validateOffer(offer, config, now),
    updatedAt: now.toISOString()
  };
}
```

- [ ] **Step 4: Add compound score breakdown**

In `src/scoring.js`, add this exported function below `scoreOffer()`:

```js
export function scoreOfferDetailed(offer, performance = {}) {
  const reliability = clampScore(
    (offer.affiliateReady ? 28 : 0) +
    (offer.validationStatus === "ready" ? 22 : offer.validationStatus === "needs_review" ? 10 : 0) +
    (offer.inStock ? 12 : 0) +
    Math.round((offer.sourceConfidence ?? 0.5) * 10)
  );

  const attractiveness = clampScore(
    discountPoints(offer.discountPercent) +
    ratingPoints(offer.rating) +
    reviewPoints(offer.reviewCount) +
    (offer.currentPrice <= 150 ? 4 : offer.currentPrice <= 500 ? 7 : 3)
  );

  const potential = clampScore(
    (offer.category === "tech" ? 18 : 10) +
    (offer.currentPrice >= 100 ? 8 : 4) +
    (offer.store === "amazon" ? 8 : 5)
  );

  const performanceScore = clampScore(Math.min(Number(performance.clicks || 0) * 3, 30));

  const total = Math.round(
    reliability * 0.4 +
    attractiveness * 0.3 +
    potential * 0.2 +
    performanceScore * 0.1
  );

  return {
    total: Math.max(0, Math.min(100, total)),
    components: {
      reliability,
      attractiveness,
      potential,
      performance: performanceScore
    }
  };
}

function discountPoints(discountPercent = 0) {
  if (discountPercent >= 45) return 35;
  if (discountPercent >= 30) return 28;
  if (discountPercent >= 20) return 20;
  if (discountPercent >= 10) return 10;
  return 3;
}

function ratingPoints(rating = 0) {
  if (rating >= 4.7) return 20;
  if (rating >= 4.4) return 15;
  if (rating >= 4.0) return 9;
  if (rating > 0) return 2;
  return 5;
}

function reviewPoints(reviewCount = 0) {
  if (reviewCount >= 1000) return 18;
  if (reviewCount >= 300) return 12;
  if (reviewCount >= 50) return 7;
  return 2;
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
```

- [ ] **Step 5: Apply validation and detailed score in scrape pipeline**

In `src/agents.js`, update imports:

```js
import { dedupeOffers, scoreOfferDetailed, statusForScore } from "./scoring.js";
import { applyValidation } from "./validation.js";
```

Inside `runScrapePipeline()`, replace:

```js
scoredOffer.score = scoreOffer(scoredOffer);
scoredOffer.status = statusForScore(scoredOffer.score, db.state.settings);
return scoredOffer;
```

with:

```js
const validatedOffer = applyValidation(scoredOffer, config);
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
```

- [ ] **Step 6: Add single-offer validation endpoint**

In `src/server.js`, import:

```js
import { applyValidation } from "./validation.js";
```

Add this route before the draft route:

```js
const offerValidateMatch = url.pathname.match(/^\/api\/offers\/([^/]+)\/validate$/);
if (req.method === "POST" && offerValidateMatch) {
  const [, offerId] = offerValidateMatch;
  const offerIndex = db.state.offers.findIndex((item) => item.id === offerId);
  if (offerIndex === -1) {
    sendJson(res, 404, { error: "offer_not_found" });
    return;
  }
  db.state.offers[offerIndex] = applyValidation(db.state.offers[offerIndex], config);
  await db.save();
  sendJson(res, 200, db.state.offers[offerIndex]);
  return;
}
```

- [ ] **Step 7: Run tests and commit**

Run:

```powershell
npm test
```

Expected: all tests pass.

Commit:

```powershell
git add src/validation.js src/scoring.js src/agents.js src/server.js test/run-tests.js
git commit -m "feat: add offer validation and score breakdown"
```

---

### Task 3: Amazon Scout Metadata and Manual Offer Creation

**Files:**
- Modify: `src/scrapers.js`
- Modify: `src/server.js`
- Modify: `src/agents.js`
- Test: `test/run-tests.js`

- [ ] **Step 1: Write failing tests for scrape metadata and manual offer API**

Add tests:

```js
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
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm test
```

Expected: failure because offer source metadata and `/api/offers/manual` are missing.

- [ ] **Step 3: Add source metadata in scrapers**

In `src/scrapers.js`, update `sampleOffers` entries by adding:

```js
source: "mock",
sourceConfidence: 0.1,
sourceWarnings: ["mock_source"],
```

In `parseAmazonSearch()`, add these fields to pushed offers:

```js
source: "amazon_search",
sourceConfidence: 0.75,
sourceWarnings: [],
asin,
```

In `normalizeOffers()`, ensure defaults:

```js
source: offer.source || "unknown",
sourceConfidence: offer.sourceConfidence ?? 0.5,
sourceWarnings: offer.sourceWarnings || [],
```

The full return object in `normalizeOffers()` should become:

```js
return offers.map((offer) => ({
  ...offer,
  source: offer.source || "unknown",
  sourceConfidence: offer.sourceConfidence ?? 0.5,
  sourceWarnings: offer.sourceWarnings || [],
  imageUrls: uniqueImageUrls([...(offer.imageUrls || []), offer.imageUrl]).slice(0, 4),
  discountPercent: calculateDiscount(offer.currentPrice, offer.previousPrice),
  scrapedAt: new Date().toISOString()
}));
```

- [ ] **Step 4: Add manual offer route**

In `src/server.js`, update imports:

```js
import { createDraftsForOffer, createAnalyticsReport, publishApprovedX, refreshOfferAffiliateUrls, regenerateDraftCopy, runPublishPipeline, runScrapePipeline } from "./agents.js";
import { scoreOfferDetailed, statusForScore } from "./scoring.js";
import { applyValidation } from "./validation.js";
```

Add route before `/api/run/scrape`:

```js
if (req.method === "POST" && url.pathname === "/api/offers/manual") {
  const body = await readJson(req);
  const originalUrl = String(body.url || "").trim();
  if (!/^https:\/\/(www\.)?amazon\.com\.br\//.test(originalUrl)) {
    sendJson(res, 400, { error: "invalid_amazon_url" });
    return;
  }
  const asin = originalUrl.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1] || "";
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
  const validated = applyValidation(baseOffer, config);
  const score = scoreOfferDetailed(validated, { clicks: 0 });
  validated.score = score.total;
  validated.scoreBreakdown = score.components;
  validated.status = validated.publishable ? statusForScore(validated.score, db.state.settings) : validated.validationStatus;
  db.state.offers.unshift(validated);
  if (validated.status !== "archived" && validated.status !== "blocked") createDraftsForOffer(db, validated, config);
  await db.save();
  sendJson(res, 200, validated);
  return;
}
```

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
npm test
```

Expected: all tests pass.

Commit:

```powershell
git add src/scrapers.js src/server.js test/run-tests.js
git commit -m "feat: add amazon source metadata and manual offers"
```

---

### Task 4: Recommendations and Improved Reports

**Files:**
- Create: `src/recommendations.js`
- Modify: `src/agents.js`
- Modify: `src/server.js`
- Modify: `src/db.js`
- Test: `test/run-tests.js`

- [ ] **Step 1: Write failing recommendation tests**

Add import:

```js
import { buildRecommendations } from "../src/recommendations.js";
```

Add tests:

```js
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
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm test
```

Expected: failure because `src/recommendations.js` and report recommendation fields do not exist.

- [ ] **Step 3: Create recommendation module**

Create `src/recommendations.js`:

```js
export function buildRecommendations(state) {
  const recommendations = [];
  const offers = state.offers || [];
  const drafts = state.drafts || [];
  const clicks = state.clicks || [];
  const publishLog = state.publishLog || [];

  const missingAffiliate = offers.filter((offer) => !offer.affiliateReady);
  if (missingAffiliate.length) {
    recommendations.push({
      id: "fix_affiliate",
      type: "fix_affiliate",
      severity: "critical",
      title: "Links afiliados pendentes",
      detail: `${missingAffiliate.length} ofertas ainda nao podem monetizar.`,
      actionLabel: "Abrir ofertas",
      actionView: "offers",
      evidence: missingAffiliate.slice(0, 5).map((offer) => offer.title)
    });
  }

  const readyDrafts = drafts.filter((draft) => ["auto_ready", "approved"].includes(draft.status) && draft.channel === "telegram");
  if (readyDrafts.length) {
    recommendations.push({
      id: "publish_ready",
      type: "publish_ready",
      severity: "success",
      title: "Publicar ofertas prontas",
      detail: `${readyDrafts.length} drafts Telegram estao elegiveis.`,
      actionLabel: "Abrir operacao",
      actionView: "operation",
      evidence: readyDrafts.slice(0, 5).map((draft) => draft.id)
    });
  }

  const failedPublishes = publishLog.filter((entry) => entry.result && entry.result.ok === false);
  if (failedPublishes.length) {
    recommendations.push({
      id: "fix_publish_errors",
      type: "fix_publish_errors",
      severity: "critical",
      title: "Falhas de publicacao",
      detail: `${failedPublishes.length} tentativas de publicacao falharam.`,
      actionLabel: "Abrir configuracao",
      actionView: "config",
      evidence: failedPublishes.slice(0, 3).map((entry) => entry.result.detail || entry.id)
    });
  }

  const clicksByOffer = new Map();
  for (const click of clicks) clicksByOffer.set(click.offerId, (clicksByOffer.get(click.offerId) || 0) + 1);
  const top = [...clicksByOffer.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top) {
    const offer = offers.find((item) => item.id === top[0]);
    recommendations.push({
      id: "repeat_winner",
      type: "repeat_winner",
      severity: "info",
      title: "Repetir categoria vencedora",
      detail: `${offer?.title || top[0]} lidera com ${top[1]} cliques.`,
      actionLabel: "Ver relatorios",
      actionView: "ai",
      evidence: [offer?.category || "categoria desconhecida"]
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      id: "stable_pipeline",
      type: "stable_pipeline",
      severity: "info",
      title: "Pipeline estavel",
      detail: "Nenhuma acao critica pendente agora.",
      actionLabel: "Buscar ofertas",
      actionView: "operation",
      evidence: []
    });
  }

  return recommendations;
}
```

- [ ] **Step 4: Add default state fields**

In `src/db.js`, update `emptyDb`:

```js
const emptyDb = {
  offers: [],
  drafts: [],
  clicks: [],
  experiments: [],
  reports: [],
  recommendations: [],
  integrations: {},
  campaigns: [],
  settings: {
    mode: "limited",
    autoPublishThreshold: 85,
    reviewThreshold: 70
  },
  publishLog: []
};
```

- [ ] **Step 5: Update reports and API**

In `src/agents.js`, import:

```js
import { buildRecommendations } from "./recommendations.js";
```

In `createAnalyticsReport(db)`, before `const report =`, add:

```js
const recommendations = buildRecommendations(db.state);
db.state.recommendations = recommendations;
```

Add `recommendations` to the report object:

```js
recommendations,
```

In `src/server.js`, import:

```js
import { buildRecommendations } from "./recommendations.js";
```

Add route:

```js
if (req.method === "GET" && url.pathname === "/api/recommendations") {
  const recommendations = buildRecommendations(db.state);
  db.state.recommendations = recommendations;
  await db.save();
  sendJson(res, 200, recommendations);
  return;
}
```

In `publicState(db)`, include:

```js
recommendations: db.state.recommendations || [],
```

- [ ] **Step 6: Run tests and commit**

Run:

```powershell
npm test
```

Expected: all tests pass.

Commit:

```powershell
git add src/recommendations.js src/agents.js src/server.js src/db.js test/run-tests.js
git commit -m "feat: add operational recommendations"
```

---

### Task 5: Premium Frontend Dashboard and Operations UI

**Files:**
- Modify: `client/src/App.jsx`
- Modify: `client/src/styles.css` if spacing/colors require small utility fixes

- [ ] **Step 1: Build and capture current frontend baseline**

Run:

```powershell
npm run build
```

Expected: Vite build succeeds.

- [ ] **Step 2: Rename generic dashboard labels**

In `client/src/App.jsx`, replace visible generic labels:

```js
"Monthly Sales" -> "Atividade por horario"
"Monthly Target" -> "Saude da operacao"
"Statistics" -> "Funil de ofertas"
"Customers Demographic" -> "Alertas operacionais"
"Recent Orders" -> "Melhores oportunidades"
"Products" -> "Oferta"
"Category" -> "Categoria"
"Price" -> "Preco"
"Status" -> "Status"
"Affiliate" -> "Afiliado"
"Open" -> "Abrir"
"Quick Actions" -> "Acoes operacionais"
"AI Overview" -> "Recomendacoes"
"Historico de analises" -> "Historico de relatorios"
```

Also replace the search input text:

```jsx
placeholder="Buscar oferta, canal, status ou comando..."
```

- [ ] **Step 3: Add premium metrics**

In `Metrics({ state, data })`, replace the two metrics with four:

```jsx
<Metric icon={CheckCircle2} label="Pronto para publicar" value={data.autoReady} badge="verde" color={data.autoReady ? "success" : "gray"} />
<Metric icon={AlertTriangle} label="Bloqueado por link" value={data.missingAffiliate} badge="corrigir" color={data.missingAffiliate ? "warning" : "success"} />
<Metric icon={Send} label="Publicados" value={state.metrics.published} badge="Telegram" color="brand" />
<Metric icon={MousePointerClick} label="Cliques" value={state.metrics.clicks} badge={`${data.clickRate}%`} color="success" />
```

- [ ] **Step 4: Extend dashboard data for validation states**

In `buildDashboardData()`, add:

```js
const blocked = state.offers.filter((offer) => offer.validationStatus === "blocked" || offer.status === "blocked").length;
const ready = state.offers.filter((offer) => offer.validationStatus === "ready" || offer.status === "auto_ready").length;
const needsReviewOffers = state.offers.filter((offer) => offer.validationStatus === "needs_review").length;
```

Return these fields:

```js
blocked,
ready,
needsReviewOffers,
recommendations: state.recommendations || []
```

- [ ] **Step 5: Improve operation card status display**

In `DraftCard()`, below channel/price text, add:

```jsx
{offer?.validationSummary ? (
  <p className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">{offer.validationSummary}</p>
) : null}
{offer?.scoreBreakdown ? (
  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-gray-500 dark:text-gray-400">
    <span>Confianca {offer.scoreBreakdown.reliability}</span>
    <span>Atratividade {offer.scoreBreakdown.attractiveness}</span>
    <span>Potencial {offer.scoreBreakdown.potential}</span>
    <span>Historico {offer.scoreBreakdown.performance}</span>
  </div>
) : null}
```

- [ ] **Step 6: Add configuration health sections**

In `Config()`, add a diagnostics panel using `state.diagnostics` only after Task 6 exposes it. For this task, use available fields defensively:

```jsx
<div className="col-span-12 xl:col-span-4">
  <Panel title="Telegram" count={state.diagnostics?.telegram?.ready ? "Pronto" : "Revisar"}>
    <div className="space-y-2 text-theme-sm text-gray-500 dark:text-gray-400">
      <p>Dry-run: {state.diagnostics?.telegram?.dryRun ? "Ligado" : "Desligado"}</p>
      <p>Bot token: {state.diagnostics?.telegram?.hasBotToken ? "Configurado" : "Ausente"}</p>
      <p>Chat ID: {state.diagnostics?.telegram?.hasChatId ? "Configurado" : "Ausente"}</p>
    </div>
    <Button className="mt-4" variant="outline" loading={loading.telegramTest} onClick={() => action("telegramTest", () => api("/api/integrations/telegram/test", { method: "POST" }), "Teste Telegram executado")}>
      <Send className="size-4" /> Testar Telegram
    </Button>
  </Panel>
</div>
```

- [ ] **Step 7: Add recommendations rendering**

In `Reports()`, before historical reports, render:

```jsx
<div className="space-y-3">
  {(state.recommendations || data.recommendations || []).map((rec) => (
    <article key={rec.id} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <Badge color={rec.severity === "critical" ? "error" : rec.severity === "success" ? "success" : "brand"}>{rec.type}</Badge>
      <h4 className="mt-2 text-theme-sm font-semibold text-gray-800 dark:text-white/90">{rec.title}</h4>
      <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">{rec.detail}</p>
    </article>
  ))}
</div>
```

- [ ] **Step 8: Build and commit**

Run:

```powershell
npm run build
```

Expected: Vite build succeeds.

Commit:

```powershell
git add client/src/App.jsx client/src/styles.css
git commit -m "feat: upgrade affiliate operations dashboard"
```

---

### Task 6: State API Enrichment for Frontend

**Files:**
- Modify: `src/server.js`
- Test: `test/run-tests.js`

- [ ] **Step 1: Write failing state API test**

Add test:

```js
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
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm test
```

Expected: failure until `/api/state` includes diagnostics.

- [ ] **Step 3: Enrich public state**

In `src/server.js`, change:

```js
sendJson(res, 200, publicState(db));
```

to:

```js
sendJson(res, 200, publicState(db, config));
```

Change function signature:

```js
function publicState(db, config) {
```

Inside return object, add:

```js
diagnostics: buildDiagnostics({ config, state: db.state }),
recommendations: db.state.recommendations || [],
```

- [ ] **Step 4: Run tests/build and commit**

Run:

```powershell
npm test
npm run build
```

Expected: both pass.

Commit:

```powershell
git add src/server.js test/run-tests.js
git commit -m "feat: expose diagnostics in dashboard state"
```

---

### Task 7: Final Verification and Documentation Update

**Files:**
- Modify: `README.md`
- Test: full suite and production smoke commands

- [ ] **Step 1: Update README operating notes**

Add a section to `README.md` after "Fluxo":

```md
## Operacao premium Fase 1

- Use Amazon Brasil como fonte principal inicial.
- Candidatos podem vir de busca configurada ou entrada manual.
- Publicacao semi-automatica exige oferta validada, afiliado pronto, compliance ok e score alto.
- Telegram precisa de `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` e `TELEGRAM_DRY_RUN=false` para envio real.
- A aba Configuracao mostra saude das integracoes e permite teste do Telegram.
- Relatorios e recomendacoes usam dados locais de ofertas, drafts, logs e cliques.
```

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm test
npm run build
```

Expected: tests pass and build succeeds.

- [ ] **Step 3: Run local server smoke**

Run:

```powershell
$proc = Start-Process node -ArgumentList 'src/main.js' -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 3
try {
  Invoke-WebRequest -UseBasicParsing http://localhost:4318/api/health | Select-Object -ExpandProperty Content
  Invoke-WebRequest -UseBasicParsing http://localhost:4318/api/state | Select-Object -ExpandProperty Content
  Invoke-WebRequest -UseBasicParsing http://localhost:4318/api/diagnostics | Select-Object -ExpandProperty Content
} finally {
  Stop-Process -Id $proc.Id -Force
}
```

Expected:

- Health returns `ok: true`.
- State includes `offers`, `drafts`, `metrics`, `diagnostics`, and `recommendations`.
- Diagnostics includes Telegram, X, Amazon, automation, and scout objects.

- [ ] **Step 4: Commit final docs**

Commit:

```powershell
git add README.md
git commit -m "docs: update premium operation notes"
```

- [ ] **Step 5: Final status check**

Run:

```powershell
git status --short
```

Expected: only intentionally untracked `.superpowers/` may remain from brainstorming. Do not commit `.superpowers/`.

---

## Self-Review

Spec coverage:

- Amazon-first hybrid source handling: Tasks 2 and 3.
- Manual official affiliate links: Tasks 2 and 3.
- Telegram testable and observable: Tasks 1 and 6.
- X acquisition preserved as dry-run/manual: Task 1 diagnostics and existing X draft flow.
- Compound score: Task 2.
- Useful tabs and premium UI: Task 5.
- Actionable reports: Task 4.
- API/data model additions: Tasks 1, 2, 3, 4, and 6.
- Error visibility: Tasks 1, 2, 3, 5, and 6.
- Tests: every backend task starts with failing tests and ends with `npm test`.

Red flag scan:

- The plan intentionally contains no `TBD`, no `TODO`, and no unspecified implementation steps.
- All new modules have concrete code snippets and exact file paths.

Type consistency:

- `validationStatus`, `validationReasons`, `validationSummary`, `publishable`, `scoreBreakdown`, `source`, `sourceConfidence`, `sourceWarnings`, `diagnostics`, and `recommendations` are introduced before frontend usage.
- `buildDiagnostics`, `testTelegram`, `validateOffer`, `applyValidation`, `scoreOfferDetailed`, and `buildRecommendations` are defined before use.
