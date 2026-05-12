import { refreshOfferDecision } from "./agents.js";
import { scoreOfferDetailed } from "./scoring.js";
import { scrapeAmazonSource } from "./scrapers.js";

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
    const discoveryScore = scoreDiscoveryOpportunity(normalized);
    if (discoveryScore.total < settings.minScore) {
      run.rejectedLowScoreCount += 1;
      continue;
    }
    const decided = refreshOfferDecision(normalized, db, config);
    decided.score = discoveryScore.total;
    decided.scoreBreakdown = discoveryScore.components;
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

function scoreDiscoveryOpportunity(candidate) {
  return scoreOfferDetailed({
    ...candidate,
    affiliateReady: true,
    validationStatus: "ready"
  });
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
