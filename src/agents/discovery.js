import Parser from "rss-parser";
import { scrapeDeals } from "../scrapers.js";
import { hasRealPromotion } from "../deals.js";
import { buildLearningProfile, learningScoreForOffer } from "../learning.js";
import { premiumCurationScore, selectPremiumCandidates } from "../premium-curation.js";
import { offerIdentityKeys } from "../publication-dedupe.js";

const RSS_FEEDS = [
  { name: "pelando", url: "https://www.pelando.com.br/rss" },
  { name: "zoom", url: "https://www.zoom.com.br/rss/ofertas" }
];

const TECH_KEYWORDS = [
  "ssd", "nvme", "notebook", "monitor", "mouse", "teclado", "headset", "webcam",
  "hub", "placa", "memória", "ram", "processador", "gpu", "roteador", "câmera",
  "impressora", "smartphone", "tablet", "fone", "speaker", "caixa de som",
  "pendrive", "hd externo", "carregador", "cabo", "cooler"
];

function isTechItem(title) {
  const lower = (title || "").toLowerCase();
  return TECH_KEYWORDS.some(kw => lower.includes(kw));
}

function parsePrice(text) {
  if (!text) return null;
  const match = String(text).match(/R\$\s*([\d.,]+)/);
  if (!match) return null;
  const normalized = match[1].replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeRssItem(item, storeName) {
  const currentPrice = parsePrice(item.content || item.contentSnippet || item.summary || "");
  const canonicalUrl = (item.link || item.guid || "").split("?")[0].replace(/\/+$/, "");
  return {
    title: (item.title || "").trim(),
    currentPrice,
    previousPrice: null,
    discountPercent: null,
    originalUrl: item.link || item.guid || "",
    canonicalUrl,
    imageUrl: item.enclosure?.url || null,
    imageUrls: item.enclosure?.url ? [item.enclosure.url] : [],
    store: storeName,
    category: "tech",
    rating: null,
    reviewCount: null,
    inStock: true,
    source: "rss",
    sourceConfidence: 0.5,
    sourceWarnings: ["rss_source"],
    scrapedAt: new Date().toISOString()
  };
}

async function fetchRssFeed(feedConfig) {
  const parser = new Parser({ timeout: 10000, headers: { "user-agent": "TDO-Links-Bot/1.0" } });
  try {
    const feed = await parser.parseURL(feedConfig.url);
    const techItems = (feed.items || []).filter(item => isTechItem(item.title));
    return techItems.slice(0, 10).map(item => normalizeRssItem(item, feedConfig.name));
  } catch (err) {
    console.log("agent_event", JSON.stringify({ agent: "discovery", event: "rss_feed_error", feed: feedConfig.name, error: err.message }));
    return [];
  }
}

function getCanonicalUrl(offer) {
  if (offer.asin) return `asin:${offer.asin}`;
  if (offer.canonicalUrl) return offer.canonicalUrl;
  return (offer.originalUrl || offer.url || "").split("?")[0].replace(/\/+$/, "");
}

function isAlreadyKnown(offer, existingOffers) {
  const canonical = getCanonicalUrl(offer);
  const keys = new Set(offerIdentityKeys(offer));
  return existingOffers.some(existing =>
    getCanonicalUrl(existing) === canonical ||
    offerIdentityKeys(existing).some((key) => keys.has(key))
  );
}

export async function runDiscovery(db, config) {
  console.log("agent_event", JSON.stringify({ agent: "discovery", event: "start" }));

  const existingOffers = db.state.offers || [];
  const newOffers = [];

  // Amazon scraping (existing)
  try {
    const amazonOffers = await scrapeDeals(config);
    for (const offer of amazonOffers) {
      if (!isAlreadyKnown(offer, existingOffers) && !isAlreadyKnown(offer, newOffers)) {
        newOffers.push({ ...offer, source: offer.source || "amazon" });
      }
    }
    console.log("agent_event", JSON.stringify({ agent: "discovery", event: "amazon_done", found: amazonOffers.length }));
  } catch (err) {
    console.log("agent_event", JSON.stringify({ agent: "discovery", event: "amazon_error", error: err.message }));
  }

  // RSS feeds
  if (config.rssEnabled !== false) {
    for (const feedConfig of RSS_FEEDS) {
      const feedOffers = await fetchRssFeed(feedConfig);
      for (const offer of feedOffers) {
        if (!isAlreadyKnown(offer, existingOffers) && !isAlreadyKnown(offer, newOffers)) {
          newOffers.push(offer);
        }
      }
      console.log("agent_event", JSON.stringify({ agent: "discovery", event: "rss_done", feed: feedConfig.name, found: feedOffers.length }));
    }
  }

  const maxCandidates = discoveryCandidateLimit(config);
  const candidates = selectDiscoveryCandidates(newOffers, maxCandidates, db.state, config);

  console.log("agent_event", JSON.stringify({
    agent: "discovery",
    event: "ranked",
    total: newOffers.length,
    promotionEligible: candidates.length,
    selected: candidates.length,
    maxCandidates
  }));

  // Enqueue one validation job per selected candidate.
  // Also persist each candidate immediately so isAlreadyKnown blocks re-discovery
  // before the worker has a chance to process and save the rejected/validated status.
  let enqueued = 0;
  for (const offer of candidates) {
    try {
      const { validationQueue } = await import("../queues/index.js");
      if (validationQueue) {
        // Persist with status "queued" so future discovery runs skip this offer
        const alreadyInDb = isAlreadyKnown(offer, db.state.offers || []);
        if (!alreadyInDb) {
          const id = db.nextId ? db.nextId("offer") : `offer_${Date.now()}`;
          const queued = {
            id, ...offer,
            status: "queued",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          db.state.offers.unshift(queued);
          await db.save();
          await validationQueue.add("validate", { offer: queued }, {
            attempts: 2,
            backoff: { type: "exponential", delay: 30000 }
          });
        } else {
          await validationQueue.add("validate", { offer }, {
            attempts: 2,
            backoff: { type: "exponential", delay: 30000 }
          });
        }
        enqueued++;
      }
    } catch (err) {
      console.log("agent_event", JSON.stringify({ agent: "discovery", event: "enqueue_error", error: err.message }));
    }
  }

  console.log("agent_event", JSON.stringify({ agent: "discovery", event: "done", found: newOffers.length, enqueued }));
  return { found: newOffers.length, enqueued };
}

export function selectDiscoveryCandidates(offers, maxCandidates, state = {}, config = {}) {
  const profile = buildLearningProfile(state);
  const ranked = offers
    .filter(hasRealPromotion)
    .sort((a, b) => candidateScore(b, profile, state, config) - candidateScore(a, profile, state, config));
  return selectPremiumCandidates(ranked, maxCandidates, state, config);
}

export function discoveryCandidateLimit(config) {
  const configured = config.maxCandidatesPerCycle ?? 6;
  const publicationTarget = config.maxPublicationsPerCycle ?? 4;
  return Math.min(Math.max(configured, publicationTarget * 4), 10);
}

function candidateScore(offer, profile, state, config) {
  return premiumCurationScore(offer, config, state) + learningScoreForOffer(offer, profile);
}
