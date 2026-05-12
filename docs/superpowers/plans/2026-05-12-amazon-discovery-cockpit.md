# Amazon Discovery Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dashboard-configured Amazon discovery flow that runs every 2 hours, accepts only high-scoring candidates, and keeps them blocked until an official manual affiliate link is added.

**Architecture:** Add focused discovery modules around the existing JSON store, scraper parser, validation, and scoring layers. The same discovery service powers manual dashboard runs, the internal scheduler, and future external cron calls. Keep each task independently testable and commit after every task so Railway can deploy small increments.

**Tech Stack:** Node.js 20+ ESM, native HTTP server, React 19, Vite, Tailwind CSS, local JSON persistence, native `fetch`, Node `assert` tests.

---

## File Structure

- Create `src/discovery.js`: settings normalization, source building, candidate normalization, dedupe, score filtering, insertion, and run summaries.
- Create `src/discovery-scheduler.js`: small scheduler tick/loop helpers with an in-memory run lock.
- Modify `src/db.js`: add persisted discovery defaults and nested state normalization.
- Modify `src/server.js`: add discovery settings/run API routes and include discovery in `/api/state`.
- Modify `src/main.js`: start the discovery scheduler after DB load.
- Modify `src/scrapers.js`: export `scrapeAmazonSource()` so discovery can fetch one configured URL or one generated term URL at a time.
- Modify `client/src/App.jsx`: add Discovery Amazon controls in `Configuracao` and discovery cues in operation/offers cards.
- Modify `test/run-tests.js`: add discovery settings, service, API, scheduler, and blocked-candidate tests.
- Modify `README.md`: document the dashboard-managed discovery flow and Railway deployment expectations.

Use this test command locally on this machine when `npm` is unavailable:

```bash
/Users/antonio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node test/run-tests.js
```

Use this command in environments with `npm` available:

```bash
npm test
```

---

### Task 1: Persist Discovery Settings

**Files:**
- Modify: `src/db.js`
- Create: `src/discovery.js`
- Test: `test/run-tests.js`

- [ ] **Step 1: Write failing tests for discovery defaults and settings normalization**

Add this import near the top of `test/run-tests.js`:

```js
import { normalizeDiscoverySettings } from "../src/discovery.js";
```

Add these tests after the existing DB/config style tests:

```js
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
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
/Users/antonio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node test/run-tests.js
```

Expected: failure because `src/discovery.js` does not exist and `db.state.discovery` is undefined.

- [ ] **Step 3: Add discovery defaults and nested DB normalization**

In `src/db.js`, add this object above `emptyDb`:

```js
const defaultDiscovery = {
  amazon: {
    enabled: true,
    intervalHours: 2,
    minScore: 70,
    maxCandidatesPerRun: 10,
    sourceUrls: [],
    searchTerms: [],
    lastRun: null,
    nextRunAt: null
  }
};
```

Add `discovery: structuredClone(defaultDiscovery),` to `emptyDb`.

Replace the state merge in `load()`:

```js
this.state = { ...structuredClone(emptyDb), ...this.state };
```

with:

```js
this.state = normalizeState(this.state);
```

Add this function below `emptyDb`:

```js
function normalizeState(state) {
  const base = structuredClone(emptyDb);
  const merged = { ...base, ...state };
  merged.settings = { ...base.settings, ...(state.settings || {}) };
  merged.discovery = {
    ...base.discovery,
    ...(state.discovery || {}),
    amazon: {
      ...base.discovery.amazon,
      ...(state.discovery?.amazon || {})
    }
  };
  return merged;
}
```

- [ ] **Step 4: Create discovery settings helpers**

Create `src/discovery.js`:

```js
export const DEFAULT_DISCOVERY_SETTINGS = {
  enabled: true,
  intervalHours: 2,
  minScore: 70,
  maxCandidatesPerRun: 10,
  sourceUrls: [],
  searchTerms: [],
  lastRun: null,
  nextRunAt: null
};

export function normalizeDiscoverySettings(input = {}) {
  return {
    ...DEFAULT_DISCOVERY_SETTINGS,
    enabled: input.enabled !== false,
    intervalHours: clampInteger(input.intervalHours, 1, 24, DEFAULT_DISCOVERY_SETTINGS.intervalHours),
    minScore: clampInteger(input.minScore, 0, 100, DEFAULT_DISCOVERY_SETTINGS.minScore),
    maxCandidatesPerRun: clampInteger(input.maxCandidatesPerRun, 1, 50, DEFAULT_DISCOVERY_SETTINGS.maxCandidatesPerRun),
    sourceUrls: normalizeAmazonUrls(input.sourceUrls || []),
    searchTerms: normalizeSearchTerms(input.searchTerms || []),
    lastRun: input.lastRun || null,
    nextRunAt: input.nextRunAt || null
  };
}

export function updateAmazonDiscoverySettings(current = {}, patch = {}) {
  return normalizeDiscoverySettings({
    ...current,
    ...patch,
    lastRun: current.lastRun || null,
    nextRunAt: patch.nextRunAt ?? current.nextRunAt ?? null
  });
}

function normalizeAmazonUrls(values) {
  return unique(values
    .map((value) => String(value || "").trim())
    .filter((value) => /^https:\/\/(www\.)?amazon\.com\.br\//.test(value)));
}

function normalizeSearchTerms(values) {
  return unique(values
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .filter(Boolean));
}

function unique(values) {
  return [...new Set(values)];
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
```

- [ ] **Step 5: Run tests and verify pass**

Run:

```bash
/Users/antonio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node test/run-tests.js
```

Expected: all tests pass.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/db.js src/discovery.js test/run-tests.js
git commit -m "feat: add discovery settings defaults"
```

---

### Task 2: Implement Amazon Discovery Service

**Files:**
- Modify: `src/discovery.js`
- Modify: `src/scrapers.js`
- Test: `test/run-tests.js`

- [ ] **Step 1: Write failing tests for manual discovery behavior**

Update the discovery import in `test/run-tests.js`:

```js
import { buildAmazonSearchUrl, normalizeDiscoverySettings, runAmazonDiscovery } from "../src/discovery.js";
```

Add these tests:

```js
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
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
/Users/antonio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node test/run-tests.js
```

Expected: failure because `buildAmazonSearchUrl()` and `runAmazonDiscovery()` are missing.

- [ ] **Step 3: Export source-specific Amazon scraping helper**

In `src/scrapers.js`, add this export below `scrapeAmazonDeals()`:

```js
export async function scrapeAmazonSource(source, config = {}) {
  const url = source.type === "term" ? source.url : source.value;
  const html = await fetchText(url, config);
  return normalizeOffers(parseAmazonSearch(html, url));
}
```

- [ ] **Step 4: Implement discovery service**

In `src/discovery.js`, add imports:

```js
import { refreshOfferDecision } from "./agents.js";
import { scrapeAmazonSource } from "./scrapers.js";
```

Add these exports below the settings helpers:

```js
export function buildAmazonSearchUrl(term) {
  return `https://www.amazon.com.br/s?k=${encodeURIComponent(String(term || "").trim()).replace(/%20/g, "+")}`;
}

export function buildAmazonSources(settings) {
  return [
    ...settings.sourceUrls.map((value) => ({ type: "url", value, url: value })),
    ...settings.searchTerms.map((value) => ({ type: "term", value, url: buildAmazonSearchUrl(value) }))
  ];
}

export async function runAmazonDiscovery(db, config, options = {}) {
  const now = new Date();
  const trigger = options.trigger || (options.manual ? "manual" : "scheduled");
  const settings = normalizeDiscoverySettings(db.state.discovery?.amazon || {});
  const sources = buildAmazonSources(settings);
  const run = createRunSummary(db, trigger, now, sources.length);

  if (!sources.length) {
    run.ok = true;
    run.reason = "no_sources_configured";
    run.finishedAt = now.toISOString();
    finishDiscoveryRun(db, settings, run, now);
    await db.save();
    return run;
  }

  const fetchCandidates = options.fetchCandidates || ((source) => scrapeAmazonSource(source, config));
  const rawCandidates = [];
  const sourceDetails = [];

  for (const source of sources) {
    try {
      const candidates = await fetchCandidates(source);
      rawCandidates.push(...candidates.map((candidate) => ({ candidate, source })));
      sourceDetails.push({ type: source.type, value: source.value, status: "ok", found: candidates.length });
    } catch (error) {
      sourceDetails.push({ type: source.type, value: source.value, status: "error", found: 0, error: error.message });
    }
  }

  const existingKeys = new Set(db.state.offers.map(candidateKey));
  const accepted = [];

  for (const { candidate, source } of rawCandidates) {
    run.candidateCount += 1;
    const normalized = normalizeDiscoveryCandidate(db, candidate, source, now);
    const key = candidateKey(normalized);
    if (existingKeys.has(key)) {
      run.duplicateCount += 1;
      continue;
    }
    existingKeys.add(key);
    const decided = refreshOfferDecision(normalized, db, config);
    if (decided.score < settings.minScore) {
      run.rejectedLowScoreCount += 1;
      continue;
    }
    accepted.push(decided);
  }

  accepted.sort((a, b) => b.score - a.score);
  const limited = accepted.slice(0, settings.maxCandidatesPerRun);
  db.state.offers.unshift(...limited);

  run.ok = true;
  run.acceptedCount = limited.length;
  run.sourceDetails = sourceDetails;
  run.errorCount = sourceDetails.filter((item) => item.status === "error").length;
  run.finishedAt = new Date().toISOString();
  finishDiscoveryRun(db, settings, run, new Date(run.finishedAt));
  await db.save();
  return run;
}

function normalizeDiscoveryCandidate(db, candidate, source, now) {
  return {
    id: db.nextId("offer"),
    ...candidate,
    store: "amazon",
    source: "amazon_discovery",
    discoverySourceType: source.type,
    discoverySource: source.value,
    sourceUrl: candidate.sourceUrl || source.url,
    sourceConfidence: candidate.sourceConfidence ?? 0.75,
    sourceWarnings: candidate.sourceWarnings || [],
    affiliateUrl: candidate.originalUrl,
    affiliateSource: "",
    affiliateReady: false,
    score: 0,
    status: "new",
    scrapedAt: candidate.scrapedAt || now.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function createRunSummary(db, trigger, now, sourceCount) {
  return {
    id: db.nextId("disc"),
    ok: false,
    trigger,
    startedAt: now.toISOString(),
    finishedAt: null,
    sourceCount,
    candidateCount: 0,
    acceptedCount: 0,
    duplicateCount: 0,
    rejectedLowScoreCount: 0,
    errorCount: 0,
    sourceDetails: []
  };
}

function finishDiscoveryRun(db, settings, run, now) {
  const nextRunAt = new Date(now.getTime() + settings.intervalHours * 60 * 60 * 1000).toISOString();
  db.state.discovery.amazon = {
    ...settings,
    lastRun: run,
    nextRunAt
  };
}

function candidateKey(candidate) {
  if (candidate.asin) return `asin:${String(candidate.asin).toUpperCase()}`;
  try {
    const url = new URL(candidate.originalUrl);
    return `url:${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return `url:${String(candidate.originalUrl || "").trim()}`;
  }
}
```

- [ ] **Step 5: Run tests and verify pass**

Run:

```bash
/Users/antonio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node test/run-tests.js
```

Expected: all tests pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/discovery.js src/scrapers.js test/run-tests.js
git commit -m "feat: add amazon discovery service"
```

---

### Task 3: Add Discovery API Routes

**Files:**
- Modify: `src/server.js`
- Test: `test/run-tests.js`

- [ ] **Step 1: Write failing API tests**

Add this test:

```js
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
    assert.equal(response.body.enabled, false);
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
    assert.equal(response.body.ok, true);
    assert.equal(response.body.reason, "no_sources_configured");
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
    assert.equal(response.body.discovery.amazon.intervalHours, 2);
    assert.equal(response.body.discovery.amazon.lastRun.id, "disc_1");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
/Users/antonio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node test/run-tests.js
```

Expected: failure because discovery API routes and public state field are missing.

- [ ] **Step 3: Wire discovery imports and routes**

In `src/server.js`, add this import:

```js
import { runAmazonDiscovery, updateAmazonDiscoverySettings } from "./discovery.js";
```

Add these routes after `/api/recommendations`:

```js
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
```

In `publicState()`, add `discovery`:

```js
discovery: db.state.discovery,
```

Place it near `settings`.

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
/Users/antonio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node test/run-tests.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/server.js test/run-tests.js
git commit -m "feat: expose amazon discovery api"
```

---

### Task 4: Add Internal Discovery Scheduler

**Files:**
- Create: `src/discovery-scheduler.js`
- Modify: `src/main.js`
- Test: `test/run-tests.js`

- [ ] **Step 1: Write failing scheduler tests**

Add this import:

```js
import { shouldRunAmazonDiscovery, runDiscoverySchedulerTick } from "../src/discovery-scheduler.js";
```

Add these tests:

```js
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
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
/Users/antonio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node test/run-tests.js
```

Expected: failure because `src/discovery-scheduler.js` does not exist.

- [ ] **Step 3: Implement scheduler helpers**

Create `src/discovery-scheduler.js`:

```js
import { runAmazonDiscovery } from "./discovery.js";

let running = false;

export function shouldRunAmazonDiscovery(settings, now = new Date()) {
  if (settings?.enabled === false) return false;
  if (!settings?.nextRunAt) return true;
  const dueAt = new Date(settings.nextRunAt);
  if (Number.isNaN(dueAt.getTime())) return true;
  return dueAt.getTime() <= now.getTime();
}

export async function runDiscoverySchedulerTick(db, config, options = {}) {
  const now = options.now || new Date();
  const settings = db.state.discovery?.amazon || {};
  if (!shouldRunAmazonDiscovery(settings, now)) return { ran: false, reason: "not_due" };
  if (running) return { ran: false, reason: "already_running" };
  running = true;
  try {
    const runDiscovery = options.runDiscovery || ((database, appConfig) => runAmazonDiscovery(database, appConfig, { trigger: "scheduled" }));
    const result = await runDiscovery(db, config);
    return { ran: true, result };
  } finally {
    running = false;
  }
}

export function startDiscoveryScheduler(db, config, options = {}) {
  const intervalMs = options.intervalMs || 60 * 1000;
  const timer = setInterval(() => {
    runDiscoverySchedulerTick(db, config).catch((error) => console.error("discovery_failed", error));
  }, intervalMs);
  runDiscoverySchedulerTick(db, config).catch((error) => console.error("discovery_failed", error));
  return timer;
}
```

- [ ] **Step 4: Start scheduler in main**

In `src/main.js`, add import:

```js
import { startDiscoveryScheduler } from "./discovery-scheduler.js";
```

After `app.listen(...)`, add:

```js
startDiscoveryScheduler(db, config);
```

- [ ] **Step 5: Run tests and verify pass**

Run:

```bash
/Users/antonio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node test/run-tests.js
```

Expected: all tests pass.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/discovery-scheduler.js src/main.js test/run-tests.js
git commit -m "feat: schedule amazon discovery"
```

---

### Task 5: Add Dashboard Discovery Controls and Candidate Cues

**Files:**
- Modify: `client/src/App.jsx`
- Test: `client build`, `test/run-tests.js`

- [ ] **Step 1: Inspect existing App.jsx state/action helpers**

Read the nearby code for `ConfigView`, `OperationView`, `OfferCard`, `api`, and `action`:

```bash
rg -n "function ConfigView|function OperationView|function OfferCard|const api|function api|action\\(" client/src/App.jsx
```

Expected: identify the existing component patterns before editing.

- [ ] **Step 2: Add discovery form state in ConfigView**

Inside the configuration component, derive current discovery settings:

```jsx
const discovery = state.discovery?.amazon || {
  enabled: true,
  intervalHours: 2,
  minScore: 70,
  maxCandidatesPerRun: 10,
  sourceUrls: [],
  searchTerms: [],
  lastRun: null,
  nextRunAt: null
};
const [discoveryForm, setDiscoveryForm] = useState({
  enabled: discovery.enabled,
  intervalHours: discovery.intervalHours,
  minScore: discovery.minScore,
  maxCandidatesPerRun: discovery.maxCandidatesPerRun,
  sourceUrls: (discovery.sourceUrls || []).join("\n"),
  searchTerms: (discovery.searchTerms || []).join("\n")
});
useEffect(() => {
  setDiscoveryForm({
    enabled: discovery.enabled,
    intervalHours: discovery.intervalHours,
    minScore: discovery.minScore,
    maxCandidatesPerRun: discovery.maxCandidatesPerRun,
    sourceUrls: (discovery.sourceUrls || []).join("\n"),
    searchTerms: (discovery.searchTerms || []).join("\n")
  });
}, [discovery.enabled, discovery.intervalHours, discovery.minScore, discovery.maxCandidatesPerRun, JSON.stringify(discovery.sourceUrls || []), JSON.stringify(discovery.searchTerms || [])]);
```

- [ ] **Step 3: Add settings save and run actions**

Use the existing `action()` pattern and add handlers:

```jsx
const saveDiscovery = () => action("discoverySave", () => api("/api/discovery/amazon/settings", {
  method: "PUT",
  body: {
    enabled: discoveryForm.enabled,
    intervalHours: discoveryForm.intervalHours,
    minScore: discoveryForm.minScore,
    maxCandidatesPerRun: discoveryForm.maxCandidatesPerRun,
    sourceUrls: lines(discoveryForm.sourceUrls),
    searchTerms: lines(discoveryForm.searchTerms)
  }
}), "Descoberta Amazon atualizada");

const runDiscovery = () => action("discoveryRun", () => api("/api/discovery/amazon/run", { method: "POST" }), "Descoberta Amazon executada");
```

Add this helper near other small helpers:

```jsx
function lines(value) {
  return String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}
```

- [ ] **Step 4: Render the Descoberta Amazon panel**

Add a `Panel` in `ConfigView`:

```jsx
<Panel title="Descoberta Amazon" count={discovery.enabled ? "Ativa" : "Pausada"}>
  <div className="grid gap-4 xl:grid-cols-2">
    <label className="text-theme-sm text-gray-700 dark:text-gray-300">
      URLs Amazon
      <textarea
        className="mt-2 min-h-28 w-full rounded-lg border border-gray-200 bg-white p-3 text-theme-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
        value={discoveryForm.sourceUrls}
        onChange={(event) => setDiscoveryForm({ ...discoveryForm, sourceUrls: event.target.value })}
        placeholder="https://www.amazon.com.br/s?k=ssd"
      />
    </label>
    <label className="text-theme-sm text-gray-700 dark:text-gray-300">
      Termos de busca
      <textarea
        className="mt-2 min-h-28 w-full rounded-lg border border-gray-200 bg-white p-3 text-theme-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
        value={discoveryForm.searchTerms}
        onChange={(event) => setDiscoveryForm({ ...discoveryForm, searchTerms: event.target.value })}
        placeholder={"SSD NVMe 1TB\nmonitor 144hz"}
      />
    </label>
  </div>
  <div className="mt-4 grid gap-3 md:grid-cols-4">
    <NumberField label="Intervalo (h)" value={discoveryForm.intervalHours} onChange={(value) => setDiscoveryForm({ ...discoveryForm, intervalHours: value })} />
    <NumberField label="Score minimo" value={discoveryForm.minScore} onChange={(value) => setDiscoveryForm({ ...discoveryForm, minScore: value })} />
    <NumberField label="Max. por ciclo" value={discoveryForm.maxCandidatesPerRun} onChange={(value) => setDiscoveryForm({ ...discoveryForm, maxCandidatesPerRun: value })} />
    <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-theme-sm dark:border-gray-800">
      <input type="checkbox" checked={discoveryForm.enabled} onChange={(event) => setDiscoveryForm({ ...discoveryForm, enabled: event.target.checked })} />
      Automatica
    </label>
  </div>
  <div className="mt-4 grid gap-3 md:grid-cols-3">
    <StatusLine label="Ultima execucao" value={discovery.lastRun?.finishedAt ? formatDate(discovery.lastRun.finishedAt) : "Nunca"} />
    <StatusLine label="Aceitos" value={String(discovery.lastRun?.acceptedCount ?? 0)} />
    <StatusLine label="Proxima execucao" value={discovery.nextRunAt ? formatDate(discovery.nextRunAt) : "Aguardando fontes"} />
  </div>
  <div className="mt-4 flex flex-wrap gap-2">
    <Button loading={loading.discoverySave} onClick={saveDiscovery}>Salvar descoberta</Button>
    <Button variant="outline" loading={loading.discoveryRun} onClick={runDiscovery}>Buscar agora</Button>
  </div>
</Panel>
```

If `NumberField`, `StatusLine`, or `formatDate` do not exist, add small local helpers matching the app style:

```jsx
function NumberField({ label, value, onChange }) {
  return (
    <label className="text-theme-sm text-gray-700 dark:text-gray-300">
      {label}
      <input
        className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-theme-sm outline-none focus:border-brand-500 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function StatusLine({ label, value }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
      <p className="text-theme-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-theme-sm font-medium text-gray-800 dark:text-white">{value}</p>
    </div>
  );
}

function formatDate(value) {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
```

- [ ] **Step 5: Add discovered-candidate cues to offer cards**

Where offer metadata badges are rendered, add:

```jsx
{offer.source === "amazon_discovery" ? <Badge tone="warning">Descoberta Amazon</Badge> : null}
{offer.discoverySource ? <span className="text-theme-xs text-gray-500 dark:text-gray-400">{offer.discoverySourceType === "term" ? "Termo" : "URL"}: {offer.discoverySource}</span> : null}
{offer.source === "amazon_discovery" && !offer.affiliateReady ? <Badge tone="danger">Link oficial pendente</Badge> : null}
```

Use the existing `Badge`/tone names in `App.jsx`; if the existing component uses `color` instead of `tone`, adapt the prop to match the local component signature.

- [ ] **Step 6: Build and run tests**

Run:

```bash
/Users/antonio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node test/run-tests.js
npm run build
```

If `npm` is still unavailable locally, run:

```bash
/opt/homebrew/bin/brew install node
npm run build
```

Expected: tests pass and Vite build succeeds.

- [ ] **Step 7: Commit Task 5**

```bash
git add client/src/App.jsx dist test/run-tests.js
git commit -m "feat: add amazon discovery dashboard controls"
```

If `dist` is not tracked or build output is intentionally ignored, omit `dist` from the commit.

---

### Task 6: Final Documentation and Deploy-Ready Verification

**Files:**
- Modify: `README.md`
- Optional modify: `.env.example` if discovery env defaults are later added; skip if no env keys are introduced.

- [ ] **Step 1: Update README with operator workflow**

Add this section after `## Operacao premium Fase 1`:

```md
## Descoberta Amazon

- Configure URLs e termos na aba Configuracao > Descoberta Amazon.
- O scheduler interno roda a cada 2 horas por padrao.
- Use "Buscar agora" para alimentar a fila manualmente.
- Cada ciclo aceita por padrao ate 10 candidatos com score minimo 70.
- Candidatos descobertos entram bloqueados ate receberem um link oficial manual, como SiteStripe ou amzn.to.
- O painel mostra ultima execucao, proxima execucao, aceitos, duplicados, rejeitados e erros por fonte.
```

- [ ] **Step 2: Run full verification**

Run:

```bash
/Users/antonio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node test/run-tests.js
npm run build
git status --short
```

Expected:

- Node tests pass.
- Build succeeds.
- `git status --short` only shows intentional README/UI/build changes.

- [ ] **Step 3: Commit Task 6**

```bash
git add README.md
git commit -m "docs: document amazon discovery workflow"
```

- [ ] **Step 4: Push for Railway deployment**

After confirming all task commits are present:

```bash
git log --oneline -6
git push
```

Expected: Railway sees the pushed commits and deploys the latest state. Verify the site after Railway finishes deploying.

---

## Commit Cadence

Commit after every task:

1. `feat: add discovery settings defaults`
2. `feat: add amazon discovery service`
3. `feat: expose amazon discovery api`
4. `feat: schedule amazon discovery`
5. `feat: add amazon discovery dashboard controls`
6. `docs: document amazon discovery workflow`

This matches the requested Railway workflow: each completed task is visible as a small deployable increment.

## Self-Review Notes

- Spec coverage: settings, service, blocked candidate behavior, scheduler, API, UI, observability, and tests all map to tasks.
- No broad database migration is included; JSON state is extended in place.
- No automatic publishing is introduced; candidates remain blocked until manual official affiliate link validation.
- The no-source first-deploy case is explicitly handled as a healthy no-op.
- The plan keeps implementation mostly in new focused modules, with `server.js`, `main.js`, and `App.jsx` touched only at integration points.
