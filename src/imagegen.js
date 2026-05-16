import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function generateOfferImage(offer, config) {
  if (!config.openaiApiKey) return null;
  if (!offer.imageUrl && !offer.title) return null;

  const imagePath = join(dirname(config.dataFile), "images", `${offer.id}.jpg`);
  try {
    const description = offer.imageUrl
      ? await analyzeProductImage(offer, config)
      : null;

    const b64 = await generateWithDalle(description || offer.title, config);
    if (!b64) return null;

    await mkdir(dirname(imagePath), { recursive: true });
    await writeFile(imagePath, Buffer.from(b64, "base64"));
    console.log("imagegen_done", JSON.stringify({ offerId: offer.id, imagePath }));
    return imagePath;
  } catch (error) {
    console.error("imagegen_error", JSON.stringify({ offerId: offer.id, error: error.message }));
    return null;
  }
}

export async function generateImagesForOffers(offers, config, db) {
  for (const offer of offers) {
    const offerInDb = db.state.offers.find((o) => o.id === offer.id);
    if (!offerInDb) continue;
    const imagePath = await generateOfferImage(offerInDb, config);
    if (imagePath) {
      offerInDb.generatedImagePath = imagePath;
      offerInDb.generatedAt = new Date().toISOString();
      await db.save();
    }
  }
}

async function analyzeProductImage(offer, config) {
  const content = [
    offer.imageUrl
      ? { type: "image_url", image_url: { url: offer.imageUrl, detail: "low" } }
      : null,
    {
      type: "text",
      text: `Describe this product in English for professional e-commerce photography generation. Product: "${offer.title}". Focus on: physical appearance, color, shape, key visual details. Max 80 words, no brand names.`
    }
  ].filter(Boolean);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${config.openaiApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content }], max_tokens: 120 })
  });

  if (!response.ok) return null;
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

async function generateWithDalle(description, config) {
  const prompt = [
    "Professional e-commerce product photography.",
    description,
    "Pure white background, studio lighting, centered product, ultra sharp focus, no text, no watermarks, premium marketing quality."
  ].join(" ").slice(0, 1000);

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { authorization: `Bearer ${config.openaiApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "dall-e-3", prompt, n: 1, size: "1024x1024", quality: "standard", response_format: "b64_json" })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.error("dalle_error", JSON.stringify({ status: response.status, error: err?.error?.message }));
    return null;
  }
  const data = await response.json();
  return data.data?.[0]?.b64_json || null;
}
