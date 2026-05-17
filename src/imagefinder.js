// Finds professional product images from the official manufacturer website
// instead of generating them with AI

export async function findOfficialProductImages(offer, config) {
  if (!config.openaiApiKey) return fallbackUrls(offer);

  const officialUrl = await identifyOfficialUrl(offer, config);
  console.log("imagefinder_url", JSON.stringify({ offerId: offer.id, officialUrl }));

  if (!officialUrl) return fallbackUrls(offer);

  const scraped = await scrapeProductImages(officialUrl);
  if (scraped.length) {
    console.log("imagefinder_found", JSON.stringify({ offerId: offer.id, count: scraped.length, source: "official_site" }));
    return scraped;
  }

  const fallback = fallbackUrls(offer);
  console.log("imagefinder_fallback", JSON.stringify({ offerId: offer.id, count: fallback.length, source: "store_cdn" }));
  return fallback;
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
    // Sanity check: not a store/marketplace
    if (/amazon|mercadolivre|shopee|kabum|magalu|aliexpress/i.test(url)) return null;
    return url;
  } catch {
    return null;
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
    if (!res.ok) return [];

    const html = await res.text();
    const images = new Set();

    // 1. JSON-LD product schema (most reliable)
    for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const items = [JSON.parse(m[1])].flat();
        for (const item of items) {
          const imgs = [item.image, item.image?.url].flat().filter(Boolean);
          imgs.forEach(i => typeof i === "string" && i.startsWith("http") && images.add(i));
        }
      } catch {}
    }

    // 2. Open Graph (og:image)
    for (const m of html.matchAll(/<meta[^>]*property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/gi)) {
      if (m[1].startsWith("http")) images.add(m[1]);
    }

    // 3. Twitter card
    for (const m of html.matchAll(/<meta[^>]*name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/gi)) {
      if (m[1].startsWith("http")) images.add(m[1]);
    }

    return [...images]
      .filter(u => !/favicon|logo|icon|sprite|banner|badge/i.test(u))
      .filter(u => /\.(jpg|jpeg|png|webp)(\?|$)/i.test(u) || u.includes("image") || u.includes("photo"))
      .slice(0, 4);
  } catch {
    return [];
  }
}

function fallbackUrls(offer) {
  return [
    ...(Array.isArray(offer.imageUrls) ? offer.imageUrls : []),
    ...(offer.imageUrl ? [offer.imageUrl] : [])
  ].filter(u => /^https?:\/\//i.test(u || "")).slice(0, 4);
}
