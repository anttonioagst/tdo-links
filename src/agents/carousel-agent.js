/**
 * carousel-agent.js
 * Automated carousel pipeline:
 *   1. Selects top products from published Telegram deals (from DB)
 *   2. Researches trends + click-worthiness via web search
 *   3. Generates carousel copy (Claude)
 *   4. Generates 4 editorial images (Higgsfield)
 *   5. Composites with TDO brand template (Sharp)
 *   6. Saves output to human-output/instagram/carousels/
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { generateCarouselImages } from "../higgsfield-imagegen.js";
import { composeCover, composeInternalSlide } from "../instagram-compositor.js";

const OUTPUT_BASE = resolve(
  process.env.HOME || "/tmp",
  "Documents/Work/Projects/TDO LINKS/human-output/instagram/carousels"
);

// ─── Product selection ────────────────────────────────────────────────────────

/**
 * Selects the top N published deals of the day, sorted by scoring.
 * Skips offers that already have a carousel generated today.
 */
function selectTopProducts(db, maxCount = 3) {
  const today = new Date().toISOString().slice(0, 10);
  const alreadyProcessed = new Set(
    (db.state.carouselLog || [])
      .filter(e => e.date === today)
      .map(e => e.offerId)
  );

  const published = Object.values(db.state.offers || {}).filter(o =>
    o.status === "published" &&
    o.publishedAt?.startsWith(today) &&
    !alreadyProcessed.has(o.id)
  );

  // Sort by discount magnitude × scoring (most compelling first)
  return published
    .sort((a, b) => {
      const scoreA = (a.score || 0) + (a.discountPercent || 0) * 0.5;
      const scoreB = (b.score || 0) + (b.discountPercent || 0) * 0.5;
      return scoreB - scoreA;
    })
    .slice(0, maxCount);
}

// ─── Trend research ───────────────────────────────────────────────────────────

/**
 * Researches trending content angles for a product via web search.
 * Returns a text summary to inform carousel copy.
 */
async function researchTrends(offer, config) {
  if (!config.anthropicApiKey) return "";

  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  // Use Claude with web search tool to research trends
  const query = `${offer.title} review destacados tendências Brasil 2025 2026 por que comprar`;

  try {
    const res = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{
        role: "user",
        content: `Pesquise sobre "${offer.title}" e me dê em 3-4 bullet points:
1. Por que esse produto é popular agora (tendências)
2. Principais diferenciais que geram desejo de compra
3. Público que mais compra / contexto de uso
4. Principais comparações que aparecem nas pesquisas

Responda em português, de forma direta para usar como briefing de copy de Instagram.`
      }]
    });

    const textBlock = res.content.find(b => b.type === "text");
    return textBlock?.text || "";
  } catch (err) {
    console.log("carousel_trend_research_skip", JSON.stringify({ error: err.message }));
    return "";
  }
}

// ─── Carousel copy generation ─────────────────────────────────────────────────

/**
 * Generates carousel concept: headline, discount label, 4 slide copy blocks.
 */
async function generateCarouselCopy(offer, trends, config) {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const discount = offer.discountPercent
    ? `${Math.round(offer.discountPercent)}% OFF`
    : "OFERTA";

  const prompt = `Você é copywriter sênior da TDO LINKS — curadoria premium de tech no Brasil.
Tom: editorial, conciso, aspiracional. Nunca genérico. Sem emojis nos textos das imagens.

PRODUTO: ${offer.title}
PREÇO: R$ ${offer.price} (${discount})
TENDÊNCIAS PESQUISADAS: ${trends || "produto tech premium popular no Brasil"}

Gere o copy para um carrossel de Instagram com 4 slides:

SLIDE 1 (CAPA):
- Texto do desconto: "${discount}" (manter)
- Nome do produto: versão curta do nome (máx 4 palavras)

SLIDE 2 (POR QUÊ VALE):
- Headline impactante (máx 6 palavras, sem pontuação)
- 1 frase de corpo (máx 15 palavras)

SLIDE 3 (DESTAQUE TÉCNICO):
- Headline com o diferencial principal (máx 6 palavras)
- 1 frase de corpo (máx 15 palavras)

SLIDE 4 (CTA):
- Headline de urgência/exclusividade (máx 5 palavras)
- 1 frase de corpo (máx 12 palavras)

Responda SOMENTE como JSON válido:
{
  "discount": "${discount}",
  "productShortName": "...",
  "slides": [
    { "type": "capa", "discountLabel": "...", "productName": "..." },
    { "type": "why", "headline": "...", "body": "..." },
    { "type": "tech", "headline": "...", "body": "..." },
    { "type": "cta", "headline": "...", "body": "..." }
  ]
}`;

  const res = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }]
  });

  const raw = res.content.find(b => b.type === "text")?.text || "{}";
  // Extract JSON even if wrapped in markdown
  const match = raw.match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(match?.[0] || raw);
  } catch {
    return {
      discount,
      productShortName: offer.title?.split(" ").slice(0, 3).join(" "),
      slides: [
        { type: "capa", discountLabel: discount, productName: offer.title?.split(" ").slice(0, 4).join(" ") },
        { type: "why", headline: "Por que é o melhor custo-benefício", body: "Performance real pelo menor preço do mercado." },
        { type: "tech", headline: "Tecnologia que faz diferença", body: "Especificações que você vai usar todo dia." },
        { type: "cta", headline: "Só hoje nesse preço", body: "Link na bio. Estoque limitado." }
      ]
    };
  }
}

// ─── Template composition ─────────────────────────────────────────────────────

async function composeCarouselSlides(imagePaths, copy, outputDir) {
  const results = [];
  const [heroPath, lifestylePath, macroPath, featurePath] = imagePaths;

  // Slide 0 — Capa
  if (heroPath) {
    const outPath = join(outputDir, "slide_01_capa.jpg");
    const capaCopy = copy.slides?.find(s => s.type === "capa") || {};
    await composeCover(heroPath, {
      productLine: capaCopy.discountLabel || copy.discount || "OFERTA",
      brandName: capaCopy.productName || copy.productShortName || "",
      outPath,
    });
    results.push(outPath);
  }

  // Slides 1-3 — Inner slides (full-bleed photo + brand assets, no text per Figma pattern)
  const innerImages = [lifestylePath, macroPath, featurePath].filter(Boolean);

  for (let i = 0; i < innerImages.length; i++) {
    const outPath = join(outputDir, `slide_0${i + 2}_inner.jpg`);
    await composeInternalSlide(innerImages[i], { outPath });
    results.push(outPath);
  }

  return results;
}

// ─── Output + logging ─────────────────────────────────────────────────────────

async function saveLog(db, offer, outputDir, slides) {
  const entry = {
    offerId: offer.id,
    date: new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
    title: offer.title,
    outputDir,
    slides,
  };
  db.state.carouselLog = [...(db.state.carouselLog || []), entry];
  await db.save();

  // Write manifest file for easy reference
  await writeFile(
    join(outputDir, "manifest.json"),
    JSON.stringify({ offer, slides, createdAt: entry.createdAt }, null, 2)
  );

  console.log("carousel_saved", JSON.stringify({
    offerId: offer.id,
    title: offer.title?.slice(0, 50),
    slides: slides.length,
    outputDir,
  }));
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * runCarouselAgent
 * Runs the full carousel pipeline for the top deals of the day.
 * Safe to call on a cron — skips already-processed offers.
 *
 * @param {object} db     — DB instance (PgDb or JsonDb)
 * @param {object} config — app config
 * @param {number} maxCarousels — max carousels to generate per run (default 1)
 */
export async function runCarouselAgent(db, config, maxCarousels = 1) {
  if (!config.anthropicApiKey) {
    console.log("carousel_agent_skip", JSON.stringify({ reason: "no_anthropic_key" }));
    return { ok: false, reason: "no_anthropic_key" };
  }

  const products = selectTopProducts(db, maxCarousels);

  if (!products.length) {
    console.log("carousel_agent_skip", JSON.stringify({ reason: "no_new_published_offers_today" }));
    return { ok: true, generated: 0, reason: "no_new_published_offers_today" };
  }

  const generated = [];

  for (const offer of products) {
    const slug = `${new Date().toISOString().slice(0, 10)}_${offer.id.replace(/[^a-z0-9]/gi, "_").slice(0, 20)}`;
    const outputDir = join(OUTPUT_BASE, slug);

    console.log("carousel_start", JSON.stringify({
      offerId: offer.id,
      title: offer.title?.slice(0, 60),
      outputDir,
    }));

    try {
      // Step 1 — Research trends
      console.log("carousel_research_start", JSON.stringify({ offerId: offer.id }));
      const trends = await researchTrends(offer, config);

      // Step 2 — Generate copy
      console.log("carousel_copy_start", JSON.stringify({ offerId: offer.id }));
      const copy = await generateCarouselCopy(offer, trends, config);
      console.log("carousel_copy_ok", JSON.stringify({ headline: copy.slides?.[0]?.productName }));

      // Step 3 — Generate images with Higgsfield
      console.log("carousel_images_start", JSON.stringify({ offerId: offer.id }));
      const imagesDir = join(outputDir, "raw");
      const imagePaths = await generateCarouselImages(offer, imagesDir);
      const validImages = imagePaths.filter(Boolean).length;
      console.log("carousel_images_ok", JSON.stringify({ generated: validImages }));

      if (!validImages) {
        console.error("carousel_images_failed", JSON.stringify({ offerId: offer.id }));
        continue;
      }

      // Step 4 — Composite with brand template
      console.log("carousel_compose_start", JSON.stringify({ offerId: offer.id }));
      const slidesDir = join(outputDir, "slides");
      await mkdir(slidesDir, { recursive: true });
      const slides = await composeCarouselSlides(imagePaths, copy, slidesDir);
      console.log("carousel_compose_ok", JSON.stringify({ slides: slides.length }));

      // Step 5 — Save log
      await saveLog(db, offer, outputDir, slides);
      generated.push({ offerId: offer.id, slides, outputDir });

    } catch (err) {
      console.error("carousel_agent_error", JSON.stringify({
        offerId: offer.id,
        error: err.message,
      }));
    }
  }

  return { ok: true, generated: generated.length, items: generated };
}
