import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const CATEGORY_STYLE = {
  tech: "Pure white background, studio lighting with soft shadow, centered product, ultra sharp focus.",
  electronics: "Pure white background, studio lighting with soft shadow, centered product, ultra sharp focus.",
  fashion: "Neutral warm background, natural light, lifestyle editorial quality, fashion photography.",
  clothing: "Neutral warm background, natural light, lifestyle editorial quality, fashion photography.",
  food: "Top-down flat-lay food photography, textured surface, vibrant colors, editorial quality.",
  beauty: "Clean white background, soft diffused lighting, beauty editorial quality, spa aesthetic.",
  default: "Pure white background, studio lighting, centered product, premium e-commerce quality."
};

function categoryStyle(category) {
  return CATEGORY_STYLE[String(category || "").toLowerCase()] || CATEGORY_STYLE.default;
}

export async function generateOfferImage(offer, config) {
  if (!config.openaiApiKey) throw new Error("openai_not_configured");

  const urls = [...new Set([
    ...(Array.isArray(offer.imageUrls) ? offer.imageUrls : []),
    ...(offer.imageUrl ? [offer.imageUrl] : [])
  ])].filter(Boolean).slice(0, 5);

  if (!urls.length && !offer.title) throw new Error("no_visual_data");

  const images = await downloadImagesParallel(urls);
  const description = await analyzeWithVision(offer, images, config);
  const b64 = await generateWithDalle(description, offer.category, config);

  const imagePath = join(dirname(config.dataFile), "images", `${offer.id}.jpg`);
  try {
    await mkdir(dirname(imagePath), { recursive: true });
    await writeFile(imagePath, Buffer.from(b64, "base64"));
  } catch (err) {
    throw new Error(`storage_failed: ${err.message}`);
  }

  console.log("imagegen_done", JSON.stringify({ offerId: offer.id, imagePath }));
  return imagePath;
}

export async function generateImagesForOffers(offers, config, db) {
  for (const offer of offers) {
    const offerInDb = db.state.offers.find((o) => o.id === offer.id);
    if (!offerInDb) continue;
    try {
      const imagePath = await generateOfferImage(offerInDb, config);
      offerInDb.generatedImagePath = imagePath;
      offerInDb.generatedAt = new Date().toISOString();
      await db.save();
    } catch (error) {
      console.error("imagegen_error", JSON.stringify({ offerId: offerInDb.id, error: error.message }));
    }
  }
}

async function downloadImagesParallel(urls) {
  if (!urls.length) return [];
  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) return null;
        const buffer = await res.arrayBuffer();
        const b64 = Buffer.from(buffer).toString("base64");
        const contentType = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
        return { b64, contentType };
      } catch {
        return null;
      }
    })
  );
  return results.filter(Boolean);
}

async function analyzeWithVision(offer, images, config) {
  const imageContent = images.map(({ b64, contentType }) => ({
    type: "image_url",
    image_url: { url: `data:${contentType};base64,${b64}`, detail: "low" }
  }));

  const prompt = [
    "You are a professional product photographer's assistant.",
    "Analyze these product images and describe in English:",
    "1. Exact colors (primary and secondary)",
    "2. Material and texture (matte plastic, brushed metal, fabric, etc.)",
    "3. Shape and form factor",
    "4. Key visual details (buttons, ports, patterns, decorative elements)",
    "5. Size impression (compact, large, wearable, etc.)",
    "",
    `Product: "${offer.title}" | Category: ${offer.category || "general"}`,
    "Max 120 words. No brand names. Factual and visual only."
  ].join("\n");

  const content = images.length
    ? [...imageContent, { type: "text", text: prompt }]
    : [{ type: "text", text: prompt }];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${config.openaiApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content }], max_tokens: 150 })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`vision_analysis_failed: ${err?.error?.message || response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || offer.title;
}

async function generateWithDalle(description, category, config) {
  const style = categoryStyle(category);
  const prompt = `Professional product photography. ${style} ${description} No text, no watermarks, no logos.`.slice(0, 1000);

  // gpt-image-1 returns b64_json directly; no separate download step needed
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { authorization: `Bearer ${config.openaiApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-image-1", prompt, n: 1, size: "1024x1024", quality: "medium" })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`image_generation_failed: ${err?.error?.message || response.status}`);
  }

  const data = await response.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("image_generation_failed: empty response");
  return b64;
}
