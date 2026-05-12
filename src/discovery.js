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
