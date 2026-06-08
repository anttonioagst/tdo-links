#!/usr/bin/env node
/**
 * run-carousel-local.js
 * Script local para rodar o carousel agent no Mac.
 * Busca os top offers do dia via API HTTPS do tdo-links (sem precisar de acesso direto ao Postgres).
 *
 * Uso:
 *   node src/scripts/run-carousel-local.js
 *   railway run --service worker node src/scripts/run-carousel-local.js
 *
 * Variáveis necessárias (.env.local ou ambiente):
 *   ANTHROPIC_API_KEY  — chave Anthropic
 *   TDO_API_URL        — URL do tdo-links service (default: https://tdo-links-production.up.railway.app)
 *   CAROUSEL_MAX_PER_BATCH — quantos carrosséis por run (default: 1)
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config as dotenvConfig } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

dotenvConfig({ path: resolve(ROOT, ".env.local") });
dotenvConfig({ path: resolve(ROOT, ".env") });

import { generateCarouselImages } from "../higgsfield-imagegen.js";
import { composeCover, composeInternalSlide } from "../instagram-compositor.js";
import Anthropic from "@anthropic-ai/sdk";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const TDO_API_URL = process.env.TDO_API_URL || "https://tdo-links-production.up.railway.app";
const MAX_CAROUSELS = Number(process.env.CAROUSEL_MAX_PER_BATCH || 1);
const OUTPUT_BASE = resolve(process.env.HOME || "/tmp", "Documents/Work/Projects/TDO LINKS/human-output/instagram/carousels");

if (!ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY não encontrado. Adicione ao .env.local");
  process.exit(1);
}

// ─── Fetch top offers from Railway API ────────────────────────────────────────
async function fetchTopOffers() {
  const url = `${TDO_API_URL}/api/carousel/top-offers`;
  console.log("carousel_fetch_offers", JSON.stringify({ url }));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status} ${url}`);
  const data = await res.json();
  return (data.offers || []).slice(0, MAX_CAROUSELS);
}

// ─── Trend research via Claude web_search ─────────────────────────────────────
async function researchTrends(offer) {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  try {
    const res = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 800,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{
        role: "user",
        content: `Pesquise sobre "${offer.title}" e responda em 4 bullet points:
• Por que esse produto está popular agora (tendência)
• Principais diferenciais que geram desejo de compra
• Público que mais compra / contexto de uso
• Um ângulo de copy que gera mais cliques no Instagram

Responda em português, direto ao ponto.`
      }]
    });
    const text = res.content.find(b => b.type === "text");
    return text?.text || "";
  } catch (err) {
    console.log("trend_research_skip", JSON.stringify({ error: err.message }));
    return "";
  }
}

// ─── Generate carousel copy ───────────────────────────────────────────────────
async function generateCopy(offer, trends) {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const discount = offer.discountPercent ? `${Math.round(offer.discountPercent)}% OFF` : "OFERTA";

  const res = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 800,
    messages: [{
      role: "user",
      content: `Você é copywriter sênior da TDO LINKS — curadoria premium de tech no Brasil.
Tom: editorial, conciso, aspiracional. Sem emojis nos textos das imagens.

PRODUTO: ${offer.title}
PREÇO: R$ ${offer.price} (${discount})
TENDÊNCIAS: ${trends || "produto tech premium popular no Brasil"}

Responda SOMENTE como JSON válido:
{
  "discount": "${discount}",
  "productShortName": "(máx 4 palavras)",
  "slides": [
    { "type": "capa", "discountLabel": "${discount}", "productName": "(máx 4 palavras)" },
    { "type": "why", "headline": "(máx 6 palavras)", "body": "(máx 15 palavras)" },
    { "type": "tech", "headline": "(máx 6 palavras)", "body": "(máx 15 palavras)" },
    { "type": "cta", "headline": "(máx 5 palavras)", "body": "(máx 12 palavras)" }
  ]
}`
    }]
  });

  const raw = res.content.find(b => b.type === "text")?.text || "{}";
  const match = raw.match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(match?.[0] || raw);
  } catch {
    return {
      discount,
      productShortName: offer.title?.split(" ").slice(0, 3).join(" "),
      slides: [
        { type: "capa", discountLabel: discount, productName: offer.title?.split(" ").slice(0, 4).join(" ") },
        { type: "why", headline: "O melhor custo-benefício", body: "Performance real pelo menor preço do mercado." },
        { type: "tech", headline: "Tecnologia que faz diferença", body: "Specs que você vai usar todo dia." },
        { type: "cta", headline: "Só hoje nesse preço", body: "Link na bio. Estoque limitado." }
      ]
    };
  }
}

// ─── Composite slides ─────────────────────────────────────────────────────────
async function composeSlides(imagePaths, copy, outputDir) {
  await mkdir(outputDir, { recursive: true });
  const results = [];
  const [heroPath, lifestylePath, macroPath, featurePath] = imagePaths;

  // Slide 1 — Capa
  if (heroPath) {
    const outPath = join(outputDir, "slide_01_capa.jpg");
    const capa = copy.slides?.find(s => s.type === "capa") || {};
    await composeCover(heroPath, {
      productLine: capa.discountLabel || copy.discount || "OFERTA",
      brandName: capa.productName || copy.productShortName || "",
      outPath,
    });
    results.push(outPath);
    console.log("carousel_slide_ok", JSON.stringify({ slide: 1, path: outPath }));
  }

  // Slides 2-4 — Inner (full-bleed foto + brand assets, sem texto)
  const inners = [lifestylePath, macroPath, featurePath].filter(Boolean);
  for (let i = 0; i < inners.length; i++) {
    const outPath = join(outputDir, `slide_0${i + 2}_inner.jpg`);
    await composeInternalSlide(inners[i], { outPath });
    results.push(outPath);
    console.log("carousel_slide_ok", JSON.stringify({ slide: i + 2, path: outPath }));
  }

  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log("carousel_pipeline_start", JSON.stringify({ maxCarousels: MAX_CAROUSELS, apiUrl: TDO_API_URL }));

let offers;
try {
  offers = await fetchTopOffers();
} catch (err) {
  console.error("carousel_fetch_failed", JSON.stringify({ error: err.message }));
  process.exit(1);
}

if (!offers.length) {
  console.log("carousel_pipeline_done", JSON.stringify({ generated: 0, reason: "no_offers_today" }));
  process.exit(0);
}

console.log("carousel_offers_selected", JSON.stringify({
  count: offers.length,
  titles: offers.map(o => o.title?.slice(0, 50))
}));

let generated = 0;

for (const offer of offers) {
  const slug = `${new Date().toISOString().slice(0, 10)}_${offer.id?.replace(/[^a-z0-9]/gi, "_").slice(0, 20) || "offer"}`;
  const outputDir = join(OUTPUT_BASE, slug);

  console.log("carousel_item_start", JSON.stringify({ title: offer.title?.slice(0, 60) }));

  try {
    // 1. Trend research
    console.log("step_1_trends");
    const trends = await researchTrends(offer);
    console.log("step_1_trends_ok", JSON.stringify({ chars: trends.length }));

    // 2. Copy
    console.log("step_2_copy");
    const copy = await generateCopy(offer, trends);
    console.log("step_2_copy_ok", JSON.stringify({ productName: copy.productShortName }));

    // 3. Higgsfield images
    console.log("step_3_images");
    const imagesDir = join(outputDir, "raw");
    const imagePaths = await generateCarouselImages(offer, imagesDir);
    const validCount = imagePaths.filter(Boolean).length;
    console.log("step_3_images_ok", JSON.stringify({ generated: validCount }));

    if (!validCount) throw new Error("no_images_generated");

    // 4. Composite
    console.log("step_4_composite");
    const slidesDir = join(outputDir, "slides");
    const slides = await composeSlides(imagePaths, copy, slidesDir);
    console.log("step_4_composite_ok", JSON.stringify({ slides: slides.length }));

    // 5. Save manifest
    const manifest = { offer, copy, trends, slides, createdAt: new Date().toISOString() };
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    console.log("carousel_item_done", JSON.stringify({
      title: offer.title?.slice(0, 50),
      slides: slides.length,
      folder: outputDir
    }));

    generated++;
  } catch (err) {
    console.error("carousel_item_error", JSON.stringify({ title: offer.title?.slice(0, 50), error: err.message }));
  }
}

console.log("carousel_pipeline_done", JSON.stringify({ generated }));
