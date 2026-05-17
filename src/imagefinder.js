// Finds professional product images from the official manufacturer website
// instead of generating them with AI

export async function findOfficialProductImages(offer, config) {
  if (!config.openaiApiKey) return [];

  const officialUrl = await identifyOfficialUrl(offer, config);
  console.log("imagefinder_url", JSON.stringify({ offerId: offer.id, officialUrl }));
  if (!officialUrl) return [];

  // 1. Try static HTML scraping (fast, no cost)
  const scraped = await scrapeProductImages(officialUrl);
  if (scraped.length) {
    console.log("imagefinder_found", JSON.stringify({ offerId: offer.id, count: scraped.length, source: "html_scrape" }));
    return scraped;
  }

  // 2. Fallback: Google Custom Search API (handles SPA/JS-heavy sites)
  if (config.googleCseApiKey && config.googleCseId) {
    const domain = extractDomain(officialUrl);
    const googleImages = await googleImageSearch(offer.title, domain, config);
    if (googleImages.length) {
      console.log("imagefinder_found", JSON.stringify({ offerId: offer.id, count: googleImages.length, source: "google_cse", domain }));
      return googleImages;
    }
  }

  console.log("imagefinder_no_images", JSON.stringify({ offerId: offer.id, officialUrl }));
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
          content: `Find the official manufacturer product page for this product.

Product: "${offer.title}"
Amazon URL: ${offer.originalUrl || offer.url || ""}

Rules:
- Return ONLY the exact URL of the manufacturer/brand official website product page
- Do NOT return Amazon, Mercado Livre, or any reseller URL
- Prefer the global/international site (en-US) over regional sites
- The URL must point to a specific product page (not a homepage or category)
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

async function googleImageSearch(productTitle, domain, config) {
  try {
    const query = encodeURIComponent(productTitle);
    const siteParam = domain ? `&siteSearch=${encodeURIComponent(domain)}&siteSearchFilter=i` : "";
    const apiUrl = `https://www.googleapis.com/customsearch/v1?key=${config.googleCseApiKey}&cx=${config.googleCseId}&q=${query}&searchType=image&num=4&imgType=photo&safe=active${siteParam}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.log("imagefinder_google_error", JSON.stringify({ status: res.status, message: err?.error?.message }));
      return [];
    }

    const data = await res.json();
    const items = data.items || [];
    const urls = items
      .map(item => item.link)
      .filter(u => u && u.startsWith("http"))
      .filter(u => !/favicon|logo|icon|sprite|banner|badge|avatar|placeholder/i.test(u));

    console.log("imagefinder_google_raw", JSON.stringify({ domain, count: urls.length }));
    return urls.slice(0, 4);
  } catch (err) {
    console.log("imagefinder_google_error", JSON.stringify({ error: err.message }));
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
