/**
 * higgsfield-imagegen.js
 * Generates 4 editorial product shots via the Higgsfield CLI (nano_banana_2).
 * Replaces the OpenAI imagegen pipeline for carousel generation.
 *
 * Shot plan (matches TDO carousel slots):
 *   [0] hero_studio   — floating product, dark cinematic bg, rim light
 *   [1] lifestyle     — wrist/context shot, warm natural light
 *   [2] detail_macro  — extreme close-up of iconic product detail
 *   [3] feature       — screen-on / GPS / fitness context
 */

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { promisify } from "node:util";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

const exec = promisify(execFile);

// ─── Brand-aware background palette ──────────────────────────────────────────
const BRAND_BG = {
  apple:       { bg: "deep black #0d0d0d",  accent: "cold silver-white" },
  samsung:     { bg: "deep black #0a0a0a",  accent: "warm orange #EC6227" },
  sony:        { bg: "deep black #0a0a12",  accent: "cool blue" },
  razer:       { bg: "pure black #0a0a0a",  accent: "electric green" },
  logitech:    { bg: "dark navy #0e1421",   accent: "blue" },
  hyperx:      { bg: "dark black #0d0d0d",  accent: "red" },
  jbl:         { bg: "dark black #111111",  accent: "orange" },
  default:     { bg: "deep black #0a0a0a",  accent: "cold silver-white" },
};

function getBrandStyle(title = "", brand = "") {
  const key = Object.keys(BRAND_BG).find(k =>
    brand.toLowerCase().includes(k) || title.toLowerCase().includes(k)
  );
  return BRAND_BG[key] || BRAND_BG.default;
}

// ─── Lifestyle environment per product category ───────────────────────────────
const LIFESTYLE_CTX = {
  smartwatch: "wrist resting on a clean wood desk beside a white ceramic coffee mug, morning light from window",
  headset:    "on a minimal gaming desk with soft RGB ambient lighting",
  headphone:  "on a modern home studio desk, warm natural window light",
  mouse:      "on a clean minimal desk setup with a laptop and coffee cup",
  keyboard:   "on a clean desk setup with a monitor, home office",
  notebook:   "on a modern café table, natural light, person working",
  laptop:     "on a modern café table, natural light",
  monitor:    "minimal home office desk, clean white walls",
  smartphone: "resting on a clean wooden surface beside keys and earbuds",
  ssd:        "on a dark matte desk beside a laptop and screwdriver",
  default:    "on a minimal lifestyle desk, warm natural light",
};

function getLifestyleCtx(title = "", category = "") {
  const text = `${title} ${category}`.toLowerCase();
  const key = Object.keys(LIFESTYLE_CTX).find(k => text.includes(k));
  return LIFESTYLE_CTX[key] || LIFESTYLE_CTX.default;
}

// ─── Prompt builders ──────────────────────────────────────────────────────────
function buildPrompts(offer, brandStyle, lifestyleCtx) {
  const product = offer.title || "tech product";
  const { bg, accent } = brandStyle;

  return [
    // [0] Hero studio — dark cinematic floating
    `CAMERA: Medium format digital, eye-level slightly elevated, tight 3/4 front angle, product centered. LENS: 85mm equivalent, f/2.8, background defocused, product razor-sharp. PRODUCT FIDELITY: ${product}. Accurate product proportions, color and materials. No text overlays, no logos added, no watermarks. SCENE: Single product floating in void on ${bg} background. Premium product studio. LIGHT: Strong ${accent} rim light from upper left edge creating precise metallic highlight line. Subtle secondary fill from right. Deep dramatic shadows. BACKGROUND: Pure ${bg}, infinite depth. MATERIAL PHYSICS: Accurate material texture and specular response. POST BEHAVIOR: Commercial magazine polish, high contrast, deep blacks, cinematic grade, zero noise.`,

    // [1] Lifestyle wrist/context
    `CAMERA: 50mm equivalent, natural handheld angle, product in sharp focus. LENS: f/2.0, background softly blurred. PRODUCT FIDELITY: ${product}. Accurate product proportions and color. SCENE: ${lifestyleCtx}. Product is the clear hero of the scene. LIGHT: Soft natural window light from left, warm golden tone 5500K, gentle shadows. BACKGROUND: Minimal lifestyle context, soft bokeh, neutral warm tones. POST BEHAVIOR: Warm editorial lifestyle tone, authentic and aspirational, magazine quality.`,

    // [2] Macro detail — iconic component
    `CAMERA: 100mm macro lens, extreme close-up of the most iconic detail of this product. LENS: f/4, razor-thin depth of field, only one detail in focus. PRODUCT FIDELITY: ${product}. Show the most iconic physical detail — texture, logo, button, connector, or material surface. SCENE: Pure product macro beauty shot, no context. LIGHT: Single narrow key light from above-left revealing material micro-texture. Deep dramatic shadows. BACKGROUND: Pure ${bg}, defocused. MATERIAL PHYSICS: Material micro-texture and grain visible. Post: hyper-detailed, maximum sharpness in focus plane, luxury close-up feel.`,

    // [3] Feature / screen-on
    `CAMERA: 35mm equivalent, low angle looking slightly up at product, dynamic angle. LENS: f/1.8, product sharp, background heavily blurred. PRODUCT FIDELITY: ${product}. Screen is ON and showing a relevant interface — activity data, GPS map, app UI, or status display in bright colors. SCENE: Product in use context — gym, outdoor run, or active lifestyle. LIGHT: Bright overcast daylight, sharp edge highlight on product casing. BACKGROUND: Blurred outdoor or active context, dynamic bokeh. POST BEHAVIOR: Dynamic editorial sports photography feel, slightly punchy contrast, active lifestyle energy.`,
  ];
}

// ─── Download helper ──────────────────────────────────────────────────────────
async function downloadFile(url, destPath) {
  await mkdir(dirname(destPath), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download_failed: ${res.status} ${url}`);
  const dest = createWriteStream(destPath);
  await pipeline(res.body, dest);
}

// ─── Single image generation ──────────────────────────────────────────────────
async function generateOne(prompt, outPath, productImageUuid = null) {
  const args = [
    "generate", "create", "nano_banana_2",
    "--prompt", prompt,
    "--aspect_ratio", "4:5",
    "--resolution", "2k",
    "--wait",
    "--json",
  ];

  if (productImageUuid) {
    args.push("--image", productImageUuid);
  }

  const { stdout, stderr } = await exec("higgsfield", args, {
    timeout: 180_000,
    maxBuffer: 4 * 1024 * 1024,
  });

  let result;
  try {
    result = JSON.parse(stdout.trim());
  } catch {
    throw new Error(`higgsfield_parse_error: ${stdout.slice(0, 200)}`);
  }

  // CLI returns array or object
  const item = Array.isArray(result) ? result[0] : result;
  const url = item?.result_url || item?.url;
  if (!url) throw new Error(`higgsfield_no_url: ${JSON.stringify(item).slice(0, 200)}`);

  await downloadFile(url, outPath);
  return { outPath, jobId: item.id, url };
}

// ─── Upload product reference image ──────────────────────────────────────────
async function uploadProductRef(imagePath) {
  try {
    const { stdout } = await exec("higgsfield", ["upload", "create", imagePath], {
      timeout: 60_000,
    });
    return stdout.trim(); // returns UUID
  } catch {
    return null;
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────
/**
 * generateCarouselImages
 * @param {object} offer      — { title, category, imageUrl, imageUrls }
 * @param {string} outputDir  — folder where 4 PNGs will be written
 * @param {string} [productRefPath] — optional local path to a product reference image
 * @returns {string[]} array of 4 local file paths [hero, lifestyle, macro, feature]
 */
export async function generateCarouselImages(offer, outputDir, productRefPath = null) {
  await mkdir(outputDir, { recursive: true });

  const brandStyle  = getBrandStyle(offer.title, offer.brand || "");
  const lifestyleCtx = getLifestyleCtx(offer.title, offer.category || "");
  const prompts     = buildPrompts(offer, brandStyle, lifestyleCtx);

  // Upload product reference if available (dramatically improves fidelity)
  let productUuid = null;
  if (productRefPath) {
    console.log("higgsfield_upload_ref", JSON.stringify({ path: productRefPath }));
    productUuid = await uploadProductRef(productRefPath);
    console.log("higgsfield_ref_uuid", JSON.stringify({ uuid: productUuid }));
  }

  const SLOT_NAMES = ["hero_studio", "lifestyle", "macro_detail", "feature"];

  // Generate sequentially: use hero as product reference for slides 1-3
  const paths = [];
  let heroUuid = productUuid;

  for (let i = 0; i < prompts.length; i++) {
    const outPath = join(outputDir, `${i}_${SLOT_NAMES[i]}.jpg`);
    console.log("higgsfield_generate_start", JSON.stringify({ slot: SLOT_NAMES[i], hasRef: !!heroUuid }));

    try {
      const res = await generateOne(prompts[i], outPath, heroUuid);
      console.log("higgsfield_generate_ok", JSON.stringify({ slot: SLOT_NAMES[i], jobId: res.jobId }));
      paths.push(outPath);

      // After hero is done, upload it as product reference for subsequent shots
      if (i === 0 && !heroUuid) {
        heroUuid = await uploadProductRef(outPath);
        console.log("higgsfield_hero_ref", JSON.stringify({ uuid: heroUuid }));
      }
    } catch (err) {
      console.error("higgsfield_generate_failed", JSON.stringify({ slot: SLOT_NAMES[i], error: err.message }));
      paths.push(null);
    }
  }

  return paths;
}
