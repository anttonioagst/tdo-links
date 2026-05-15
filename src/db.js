import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

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

const emptyDb = {
  offers: [],
  drafts: [],
  clicks: [],
  experiments: [],
  reports: [],
  recommendations: [],
  integrations: {
    discord: {
      webhookUrl: "",
      enabled: false,
      dryRun: true,
      lastTest: null,
      lastError: null
    }
  },
  campaigns: [],
  discovery: structuredClone(defaultDiscovery),
  settings: {
    mode: "limited",
    autoPublishThreshold: 85,
    reviewThreshold: 70
  },
  publishLog: [],
  priceHistory: {}
};

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
  merged.integrations = {
    ...base.integrations,
    ...(state.integrations || {}),
    discord: {
      ...base.integrations.discord,
      ...(state.integrations?.discord || {})
    }
  };
  merged.priceHistory = state.priceHistory || {};
  return merged;
}

export class JsonDb {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = structuredClone(emptyDb);
  }

  async load() {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      this.state = JSON.parse(await readFile(this.filePath, "utf8"));
      this.state = normalizeState(this.state);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await this.save();
    }
    return this.state;
  }

  async save() {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.state, null, 2));
  }

  nextId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
