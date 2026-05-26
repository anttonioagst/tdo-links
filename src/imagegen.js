import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// Edit-oriented prompts: model sees the actual product image and applies scene/lighting
// Formula: Action on THIS product + Surface + Light + Lens + Exclusions
const ANGLE_PROMPTS = [
  // 1. Front studio — clean e-commerce
  () =>
    `Professional e-commerce product photography. Place this product on a pure white seamless background (RGB 255,255,255). Straight-on front view at eye level. Single large softbox positioned above and slightly forward casting a soft shadow directly beneath the product. 85mm lens equivalent, f/8, full product sharpness. Product centered, occupying 80% of frame. Photorealistic, sharp commercial quality. No text, no watermarks, no hands, no logos, no extra objects.`,

  // 2. Hero 45° — premium feel
  () =>
    `Professional product hero shot. Show this product from a three-quarter angle, rotated about 30 degrees from front with a slight 10-degree downward tilt. Clean light gray seamless background. Single large softbox at 45 degrees from camera left creating directional shadow and a subtle edge highlight on the right side. 85mm equivalent, f/5.6, product occupying 70% of frame height with generous negative space above. Commercial advertising quality, photorealistic. No text, no logos, no hands.`,

  // 3. Top-down flat lay — detail
  () =>
    `Professional product flat lay photography. Show this product from directly overhead, top-down view, perfectly centered on a clean white marble surface. Soft even lighting from directly above, no harsh shadows. All surface textures, materials and fine details clearly visible. 50mm equivalent, f/8, sharp focus throughout. Commercial catalog style, photorealistic. No text, no watermarks, no extra props.`,

  // 4. Lifestyle context — aspirational
  (env) =>
    `Professional lifestyle product photography. Show this product in a ${env}. The product is the clear hero of the scene. Soft natural window light from camera left, warm and inviting atmosphere. Complementary background elements slightly out of focus at f/2.8, rule-of-thirds composition. Authentic commercial lifestyle photography, photorealistic. No text, no logos, no visible branding on props.`
];

const LIFESTYLE_ENV = {
  mouse: "clean minimal desk setup with a laptop and a cup of coffee, home office",
  teclado: "clean minimal desk setup with a monitor, home office environment",
  keyboard: "clean minimal desk setup with a monitor, home office environment",
  headset: "gaming setup with soft RGB ambient lighting, desk environment",
  headphone: "modern home studio desk or cozy bedroom with natural light",
  fone: "modern lifestyle setting on a wooden surface or beside a smartphone",
  monitor: "minimal home office desk setup with clean white walls",
  notebook: "modern cafe table or clean home office desk with natural light",
  laptop: "modern cafe table or clean home office desk with natural light",
  ssd: "tech flat lay on a dark matte desk surface with a screwdriver and other components",
  hub: "clean desk setup with a MacBook and connected peripherals",
  carregador: "bedside table or desk with a smartphone charging, minimal setting",
  camera: "photographer's desk with accessories, warm natural light",
  smartphone: "lifestyle setting, resting on a clean wooden surface beside keys and earbuds",
  default: "modern minimal home office desk setup with clean neutral tones"
};

function lifestyleEnv(offer) {
  const text = `${offer.title} ${offer.category}`.toLowerCase();
  for (const [key, env] of Object.entries(LIFESTYLE_ENV)) {
    if (text.includes(key)) return env;
  }
  return LIFESTYLE_ENV.default;
}

export async function generateOfferImagePack(offer, config) {
  if (!config.openaiApiKey) throw new Error("openai_not_configured");

  const urls = [...new Set([
    ...(Array.isArray(offer.imageUrls) ? offer.imageUrls : []),
    ...(offer.imageUrl ? [offer.imageUrl] : [])
  ])].filter(Boolean).slice(0, 5);

  if (!urls.length && !offer.title) throw new Error("no_visual_data");

  const images = await downloadImagesParallel(urls);
  const env = lifestyleEnv(offer);

  // Use vision-analyzed description only when no source image is available
  const sourceImage = images[0] || null;
  let description = offer.title;
  if (!sourceImage) {
    description = await analyzeWithVision(offer, [], config);
  }

  // Build the 4 prompts
  const prompts = [
    ANGLE_PROMPTS[0](),
    ANGLE_PROMPTS[1](),
    ANGLE_PROMPTS[2](),
    ANGLE_PROMPTS[3](env)
  ];

  // Generate 4 images in parallel — edits if we have source image, else text-to-image
  const results = await Promise.allSettled(
    prompts.map((prompt, i) =>
      sourceImage
        ? generateImageEdit(prompt, sourceImage, config, i + 1)
        : generateImageText(description + ". " + prompt, config, i + 1)
    )
  );

  const imageDir = join(dirname(config.dataFile), "images");
  await mkdir(imageDir, { recursive: true });

  const savedPaths = [];
  const savedBuffers = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === "fulfilled") {
      const buf = Buffer.from(results[i].value, "base64");
      const path = join(imageDir, `${offer.id}_${i + 1}.jpg`);
      await writeFile(path, buf).catch(() => {});
      savedPaths.push(path);
      savedBuffers.push(buf);
    } else {
      console.error("imagegen_angle_failed", JSON.stringify({ offerId: offer.id, angle: i + 1, error: results[i].reason?.message }));
    }
  }

  if (!savedPaths.length) throw new Error("image_generation_failed: all angles failed");

  console.log("imagegen_done", JSON.stringify({ offerId: offer.id, count: savedPaths.length, mode: sourceImage ? "edit" : "text" }));
  return { paths: savedPaths, buffers: savedBuffers };
}

// Legacy single-image fallback (used by manual trigger)
export async function generateOfferImage(offer, config) {
  const { paths } = await generateOfferImagePack(offer, config);
  return paths[0];
}

export async function generateImagesForOffers(offers, config, db) {
  for (const offer of offers) {
    const offerInDb = db.state.offers.find((o) => o.id === offer.id);
    if (!offerInDb) continue;
    try {
      const { paths: imagePaths } = await generateOfferImagePack(offerInDb, config);
      offerInDb.generatedImagePaths = imagePaths;
      offerInDb.generatedImagePath = imagePaths[0];
      offerInDb.generatedAt = new Date().toISOString();
      offerInDb.imageStatus = "done";
      await db.save();
    } catch (error) {
      console.error("imagegen_error", JSON.stringify({ offerId: offerInDb.id, error: error.message }));
    }
  }
}

// Use /v1/images/edits with the actual product image as reference
async function generateImageEdit(prompt, sourceImage, config, angleIndex) {
  const form = new FormData();
  form.append("model", "gpt-image-1");
  form.append("prompt", prompt.slice(0, 1500));
  form.append("n", "1");
  form.append("size", "1024x1024");
  form.append("quality", "medium");
  const imgBuffer = Buffer.from(sourceImage.b64, "base64");
  form.append("image", new Blob([imgBuffer], { type: sourceImage.contentType || "image/jpeg" }), "product.jpg");

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { authorization: `Bearer ${config.openaiApiKey}` },
    body: form
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.log("imagegen_edit_fallback", JSON.stringify({ angle: angleIndex, error: err?.error?.message || response.status }));
    // Fall back to text-to-image on error
    return generateImageText(prompt, config, angleIndex);
  }

  const data = await response.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) return generateImageText(prompt, config, angleIndex);
  return b64;
}

// Text-to-image fallback (no source image)
async function generateImageText(prompt, config, angleIndex) {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { authorization: `Bearer ${config.openaiApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-image-1", prompt: prompt.slice(0, 1500), n: 1, size: "1024x1024", quality: "medium" })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`image_generation_failed (angle ${angleIndex}): ${err?.error?.message || response.status}`);
  }

  const data = await response.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error(`image_generation_failed (angle ${angleIndex}): empty response`);
  return b64;
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
    "Describe this product for use in photography prompts:",
    "1. Exact colors (primary and secondary, e.g. 'matte black', 'brushed silver')",
    "2. Material and texture (e.g. 'matte ABS plastic', 'brushed aluminum')",
    "3. Shape and form factor (e.g. 'compact rectangular', 'slim cylindrical')",
    "4. Key visual details (buttons, ports, patterns, RGB lighting, cable)",
    "5. Size impression (compact/handheld/desk-sized/wearable)",
    "",
    `Product: "${offer.title}" | Category: ${offer.category || "tech"}`,
    "Max 80 words. No brand names. Precise visual details only. Single paragraph."
  ].join("\n");

  const content = images.length
    ? [...imageContent, { type: "text", text: prompt }]
    : [{ type: "text", text: prompt }];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${config.openaiApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content }], max_tokens: 120 })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`vision_analysis_failed: ${err?.error?.message || response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || offer.title;
}
