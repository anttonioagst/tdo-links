const sampleOffers = [
  {
    store: "amazon",
    title: "SSD NVMe 1TB Gen4",
    currentPrice: 349.9,
    previousPrice: 529.9,
    originalUrl: "https://www.amazon.com.br/dp/B0SSD1TBTECH",
    imageUrl: "",
    source: "mock",
    sourceConfidence: 0.1,
    sourceWarnings: ["mock_source"],
    category: "tech",
    rating: 4.7,
    reviewCount: 1840,
    inStock: true,
    storeReputation: "high"
  },
  {
    store: "mercado_livre",
    title: "Mouse gamer sem fio 26K DPI",
    currentPrice: 179.9,
    previousPrice: 249.9,
    originalUrl: "https://produto.mercadolivre.com.br/MLB-TECH-MOUSE",
    imageUrl: "",
    source: "mock",
    sourceConfidence: 0.1,
    sourceWarnings: ["mock_source"],
    category: "tech",
    rating: 4.8,
    reviewCount: 611,
    inStock: true,
    storeReputation: "high"
  },
  {
    store: "amazon",
    title: "Hub USB-C 7 em 1",
    currentPrice: 88.9,
    previousPrice: 109.9,
    originalUrl: "https://www.amazon.com.br/dp/B0HUB7IN1",
    imageUrl: "",
    source: "mock",
    sourceConfidence: 0.1,
    sourceWarnings: ["mock_source"],
    category: "tech",
    rating: 4.2,
    reviewCount: 95,
    inStock: true,
    storeReputation: "high"
  }
];

let lastScrapeMeta = { source: "unknown", found: 0, errors: [] };

export async function scrapeDeals(config = {}) {
  if (config.scraperMode === "amazon") {
    const offers = await scrapeAmazonDeals(config);
    if (offers.length) {
      lastScrapeMeta = { source: "amazon", found: offers.length, errors: [] };
      return offers;
    }
    if (!config.scraperFallbackMock) {
      lastScrapeMeta = { source: "empty", found: 0, errors: ["Amazon returned no parseable products."] };
      return [];
    }
    lastScrapeMeta = { source: "mock_fallback", found: sampleOffers.length, errors: ["Amazon returned no parseable products; using mock fallback."] };
  }
  if (config.scraperMode !== "amazon") {
    lastScrapeMeta = { source: "mock", found: sampleOffers.length, errors: [] };
  }
  return normalizeOffers(sampleOffers);
}

export async function scrapeAmazonDeals(config) {
  const all = [];
  for (const url of config.amazonSearchUrls || []) {
    try {
      const html = await fetchText(url, config);
      const parsed = parseAmazonSearch(html, url);
      if (!parsed.length) console.error("amazon_scrape_empty", url);
      all.push(...parsed);
    } catch (error) {
      console.error("amazon_scrape_failed", url, error.message);
    }
    await sleep(1200);
  }
  return normalizeOffers(limitByUrl(all, 20));
}

export function getLastScrapeMeta() {
  return lastScrapeMeta;
}

export function parseAmazonSearch(html, sourceUrl = "https://www.amazon.com.br") {
  const chunks = html.split(/data-asin="/g).slice(1);
  const offers = [];
  for (const chunk of chunks) {
    const asin = chunk.slice(0, 16).match(/^([A-Z0-9]{10})/i)?.[1];
    if (!asin) continue;
    const title = cleanText(matchFirst(chunk, [
      /<h2[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i,
      /aria-label="([^"]{12,})"/i
    ]));
    if (!title || title.length < 8) continue;

    const currentPrice = parseBrazilPrice(matchFirst(chunk, [
      /<span class="a-price-whole">([\d.]+)<\/span><span class="a-price-decimal">,<\/span><span class="a-price-fraction">(\d{2})<\/span>/i,
      /R\$\s?([\d.]+,\d{2})/i
    ]));
    if (!currentPrice) continue;

    const previousPrice = parseBrazilPrice(matchFirst(chunk, [
      /<span class="a-price a-text-price"[^>]*>[\s\S]*?<span[^>]*>R\$\s?([\d.]+,\d{2})<\/span>/i,
      /<span class="a-offscreen">R\$\s?([\d.]+,\d{2})<\/span>/i
    ], 1, true));

    const imageUrl = decodeHtml(matchFirst(chunk, [
      /<img[^>]+src="([^"]+)"/i,
      /data-image-source-density="[^"]*"[^>]+src="([^"]+)"/i
    ]));
    const imageUrls = uniqueImageUrls([
      imageUrl,
      ...[...chunk.matchAll(/https:\/\/m\.media-amazon\.com\/images\/I\/[^"'\\\s]+?\.(?:jpg|jpeg|png|webp)/gi)].map((match) => decodeHtml(match[0]))
    ]);
    const rating = parseFloat((matchFirst(chunk, [/(\d,\d) de 5 estrelas/i]) || "").replace(",", "."));
    const reviewCount = parseInt((matchFirst(chunk, [/<span[^>]*class="a-size-base[^"]*"[^>]*>([\d.]+)<\/span>/i]) || "0").replace(/\D/g, ""), 10) || 0;

    offers.push({
      store: "amazon",
      title,
      currentPrice,
      previousPrice: previousPrice && previousPrice > currentPrice ? previousPrice : null,
      originalUrl: `https://www.amazon.com.br/dp/${asin}`,
      source: "amazon_search",
      sourceConfidence: 0.75,
      sourceWarnings: [],
      asin,
      imageUrl,
      imageUrls,
      category: "tech",
      rating: Number.isFinite(rating) ? rating : 4.4,
      reviewCount,
      inStock: true,
      storeReputation: "high",
      sourceUrl
    });
  }
  return offers;
}

export function calculateDiscount(currentPrice, previousPrice) {
  if (!previousPrice || previousPrice <= currentPrice) return 0;
  return Math.round(((previousPrice - currentPrice) / previousPrice) * 100);
}

function normalizeOffers(offers) {
  return offers.map((offer) => ({
    ...offer,
    source: offer.source || "unknown",
    sourceConfidence: offer.sourceConfidence ?? 0.5,
    sourceWarnings: offer.sourceWarnings || [],
    imageUrls: uniqueImageUrls([...(offer.imageUrls || []), offer.imageUrl]).slice(0, 4),
    discountPercent: calculateDiscount(offer.currentPrice, offer.previousPrice),
    scrapedAt: new Date().toISOString()
  }));
}

function uniqueImageUrls(urls) {
  return [...new Set(urls.filter((url) => /^https?:\/\//.test(url || "")))].slice(0, 4);
}

async function fetchText(url, config) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "accept": "text/html,application/xhtml+xml",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.6",
        "cache-control": "no-cache",
        "user-agent": config.scraperUserAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function matchFirst(text, patterns, group = 1, skipFirst = false) {
  for (const pattern of patterns) {
    const globalPattern = pattern.global ? pattern : new RegExp(pattern.source, pattern.flags + "g");
    const matches = [...text.matchAll(globalPattern)];
    const match = skipFirst && matches.length > 1 ? matches[1] : matches[0];
    if (match?.[group]) {
      if (match[group + 1]) return `${match[group]},${match[group + 1]}`;
      return match[group];
    }
  }
  return "";
}

function parseBrazilPrice(value) {
  if (!value) return null;
  const normalized = String(value).replace(/[^\d,]/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function cleanText(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function limitByUrl(offers, limit) {
  const seen = new Set();
  const result = [];
  for (const offer of offers) {
    if (seen.has(offer.originalUrl)) continue;
    seen.add(offer.originalUrl);
    result.push(offer);
    if (result.length >= limit) break;
  }
  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
