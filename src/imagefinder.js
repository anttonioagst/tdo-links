// Finds professional product images from the official manufacturer website
// instead of generating them with AI

export async function findOfficialProductImages(offer, config) {
  if (!config.openaiApiKey) return [];

  // Ask GPT for brand domain only — much more reliable than full product page URL
  const domain = await identifyBrandDomain(offer, config);
  console.log("imagefinder_domain", JSON.stringify({ offerId: offer.id, domain }));
  if (!domain) return [];

  // Brave Image Search — primary source
  if (config.braveSearchApiKey) {
    const braveImages = await braveImageSearch(offer.title, domain, config);
    if (braveImages.length) {
      console.log("imagefinder_found", JSON.stringify({ offerId: offer.id, count: braveImages.length, source: "brave", domain }));
      return braveImages;
    }
  }

  // SerpAPI — secondary fallback
  if (config.serpApiKey) {
    const serpImages = await serpApiImageSearch(offer.title, domain, config);
    if (serpImages.length) {
      console.log("imagefinder_found", JSON.stringify({ offerId: offer.id, count: serpImages.length, source: "serpapi", domain }));
      return serpImages;
    }
  }

  // Fallback: static HTML scrape of official product page
  const officialUrl = await identifyOfficialUrl(offer, config);
  if (officialUrl) {
    console.log("imagefinder_url", JSON.stringify({ offerId: offer.id, officialUrl }));
    const scraped = await scrapeProductImages(officialUrl);
    if (scraped.length) {
      console.log("imagefinder_found", JSON.stringify({ offerId: offer.id, count: scraped.length, source: "html_scrape" }));
      return scraped;
    }
  }

  console.log("imagefinder_no_images", JSON.stringify({ offerId: offer.id, domain }));
  return [];
}

// Download images from URLs into memory buffers (avoids ephemeral disk + CDN blocks on Telegram)
export async function downloadImageBuffers(urls) {
  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { "User-Agent": "Mozilla/5.0 (compatible; TDOLinks/1.0)" }
        });
        clearTimeout(timeout);
        if (!res.ok) return null;
        const buffer = Buffer.from(await res.arrayBuffer());
        const contentType = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
        return { buffer, contentType, url };
      } catch {
        return null;
      }
    })
  );
  return results.filter(Boolean);
}

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function identifyBrandDomain(offer, config) {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${config.openaiApiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 60,
        messages: [{
          role: "user",
          content: `What is the official manufacturer website domain for this product?

Product: "${offer.title}"

Rules:
- Return ONLY the domain (e.g. sony.com, logitech.com, samsung.com)
- Do NOT return amazon, mercadolivre, shopee, kabum, magalu or any reseller
- If multiple regional sites exist, use the global/international domain
- If unsure, return: unknown

Reply with the domain only, nothing else.`
        }]
      })
    });

    if (!response.ok) return null;
    const data = await response.json();
    const domain = data.choices?.[0]?.message?.content?.trim().toLowerCase();
    if (!domain || domain === "unknown" || domain.includes(" ") || domain.length > 60) return null;
    if (/amazon|mercadolivre|shopee|kabum|magalu|aliexpress/i.test(domain)) return null;
    return domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  } catch {
    return null;
  }
}

async function identifyOfficialUrl(offer, config) {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${config.openaiApiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 120,
        messages: [{
          role: "user",
          content: `Find the official manufacturer product page URL for this product.

Product: "${offer.title}"
Amazon URL: ${offer.originalUrl || offer.url || ""}

Rules:
- Return ONLY the exact URL of the official manufacturer product page
- Do NOT return Amazon, Mercado Livre, or any reseller URL
- If you are not confident (>80%) about the exact URL, return: unknown

Reply with the URL only, nothing else.`
        }]
      })
    });

    if (!response.ok) return null;
    const data = await response.json();
    const url = data.choices?.[0]?.message?.content?.trim();
    if (!url || url.toLowerCase() === "unknown" || !url.startsWith("http")) return null;
    if (/amazon|mercadolivre|shopee|kabum|magalu|aliexpress/i.test(url)) return null;
    return url;
  } catch {
    return null;
  }
}

async function serpApiImageSearch(productTitle, domain, config) {
  try {
    const params = new URLSearchParams({
      engine: "google_images",
      q: productTitle,
      api_key: config.serpApiKey,
      num: "4",
      safe: "active"
    });
    if (domain) params.set("as_sitesearch", domain);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`https://serpapi.com/search.json?${params}`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.log("imagefinder_serp_error", JSON.stringify({ status: res.status, message: err?.error }));
      return [];
    }

    const data = await res.json();
    const urls = (data.images_results || [])
      .map(item => item.original)
      .filter(u => u && u.startsWith("http"))
      .filter(u => !/favicon|logo|icon|sprite|banner|badge|avatar|placeholder/i.test(u));

    console.log("imagefinder_serp_raw", JSON.stringify({ domain, count: urls.length }));
    return urls.slice(0, 4);
  } catch (err) {
    console.log("imagefinder_serp_error", JSON.stringify({ error: err.message }));
    return [];
  }
}

async function braveImageSearch(productTitle, domain, config) {
  try {
    const q = domain ? `${productTitle} site:${domain}` : productTitle;
    const params = new URLSearchParams({ q, count: "4", safesearch: "strict" });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`https://api.search.brave.com/res/v1/images/search?${params}`, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": config.braveSearchApiKey
      }
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.log("imagefinder_brave_error", JSON.stringify({ status: res.status, message: err?.message }));
      return [];
    }

    const data = await res.json();
    const urls = (data.results || [])
      .map(item => item.properties?.url || item.url)
      .filter(u => u && u.startsWith("http"))
      .filter(u => !/favicon|logo|icon|sprite|banner|badge|avatar|placeholder/i.test(u));

    console.log("imagefinder_brave_raw", JSON.stringify({ domain, count: urls.length }));
    return urls.slice(0, 4);
  } catch (err) {
    console.log("imagefinder_brave_error", JSON.stringify({ error: err.message }));
    return [];
  }
}

async function scrapeProductImages(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });
    clearTimeout(timeout);
    console.log("imagefinder_scrape", JSON.stringify({ url, status: res.status }));
    if (!res.ok) return [];

    const html = await res.text();
    const images = new Set();

    // 1. JSON-LD product schema
    for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const items = [JSON.parse(m[1])].flat();
        for (const item of items) {
          const imgs = [item.image, item.image?.url, ...(Array.isArray(item.image) ? item.image : [])].flat().filter(Boolean);
          imgs.forEach(i => typeof i === "string" && i.startsWith("http") && images.add(i));
        }
      } catch {}
    }

    // 2. Next.js __NEXT_DATA__ (extracts all product images from SSR page data)
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (nextDataMatch) {
      try {
        const extractUrls = (obj) => {
          if (typeof obj === "string" && obj.startsWith("http") && /\.(jpg|jpeg|png|webp)/i.test(obj)) images.add(obj);
          else if (Array.isArray(obj)) obj.forEach(extractUrls);
          else if (obj && typeof obj === "object") Object.values(obj).forEach(extractUrls);
        };
        extractUrls(JSON.parse(nextDataMatch[1]));
      } catch {}
    }

    // 3. Open Graph — both attribute orders
    for (const m of html.matchAll(/<meta[^>]*property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/gi)) {
      if (m[1].startsWith("http")) images.add(m[1]);
    }
    for (const m of html.matchAll(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url)?["']/gi)) {
      if (m[1].startsWith("http")) images.add(m[1]);
    }

    // 4. Twitter card — both attribute orders
    for (const m of html.matchAll(/<meta[^>]*name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/gi)) {
      if (m[1].startsWith("http")) images.add(m[1]);
    }
    for (const m of html.matchAll(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/gi)) {
      if (m[1].startsWith("http")) images.add(m[1]);
    }

    // 5. <img> tags with data-src or src
    for (const m of html.matchAll(/<img[^>]+(?:data-src|src)=["']([^"']+)["'][^>]*>/gi)) {
      const src = m[1];
      if (src && src.startsWith("http") && src.length > 30) images.add(src);
    }

    const filtered = [...images]
      .filter(u => !/favicon|logo|icon|sprite|banner|badge|avatar|placeholder|blank|pixel|tracking|1x1/i.test(u))
      .filter(u =>
        /\.(jpg|jpeg|png|webp)(\?|$)/i.test(u) ||
        /\/(images?|photo|img|media|product|cdn)\//i.test(u) ||
        /is\/image\//i.test(u)
      );

    console.log("imagefinder_scrape_result", JSON.stringify({ url, rawCount: images.size, filteredCount: filtered.length }));
    return filtered.slice(0, 4);
  } catch (err) {
    console.log("imagefinder_scrape_error", JSON.stringify({ url, error: err.message }));
    return [];
  }
}
