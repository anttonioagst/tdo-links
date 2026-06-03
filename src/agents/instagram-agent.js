import { mkdir, writeFile, readFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { extractPremiumBrand } from "../premium-curation.js";

const exec = promisify(execFile);

const LOGO_SVG_PATH = resolve("/Users/antonio/Projects/TDO LINKS/Logo/Logo 01/Group 3.svg");
const LOGO_PNG_FALLBACK = resolve("/Users/antonio/Projects/TDO LINKS/Logo/Logo 01/Group 6.png");
const OUTPUT_BASE = resolve(process.env.HOME || "/tmp", "Documents/human-output/instagram");

// Brand color palettes — mirrors how each brand lights their product posts
const BRAND_PALETTE = {
  razer:      { bg: "#0a0a0a", glow: "#00D060", glowName: "green"   },
  logitech:   { bg: "#0e1421", glow: "#0082FC", glowName: "blue"    },
  hyperx:     { bg: "#0d0d0d", glow: "#DF0000", glowName: "red"     },
  samsung:    { bg: "#0f0f1a", glow: "#1428A0", glowName: "blue"    },
  apple:      { bg: "#1d1d1f", glow: "#86868b", glowName: "silver"  },
  sony:       { bg: "#0a0a12", glow: "#0060A9", glowName: "blue"    },
  jbl:        { bg: "#111111", glow: "#FF6B00", glowName: "orange"  },
  lg:         { bg: "#0d0d0d", glow: "#A50034", glowName: "red"     },
  anker:      { bg: "#0d1117", glow: "#0070E0", glowName: "blue"    },
  soundcore:  { bg: "#0d1117", glow: "#0070E0", glowName: "blue"    },
  asus:       { bg: "#0d0d12", glow: "#FF6600", glowName: "orange"  },
  corsair:    { bg: "#0a0a0a", glow: "#FFD700", glowName: "gold"    },
  steelseries:{ bg: "#0d0d0d", glow: "#F85020", glowName: "orange"  },
};

function getBrandPalette(brand = "") {
  return BRAND_PALETTE[brand.toLowerCase()] || { bg: "#0a0a0a", glow: "#FFFFFF", glowName: "white" };
}

// Detect background style from product title — light/pastel colors get white bg
function detectBackground(title = "", brand = "") {
  const t = title.toLowerCase();
  const lightColors = ["rosa", "rose", "quartz", "pink", "branco", "white", "prata", "silver", "cream", "bege", "nude", "champagne", "areia", "glacier", "phantom"];
  if (lightColors.some(c => t.includes(c))) {
    return { bg: "#ffffff", glow: "none", glowName: "none", style: "white", textStyle: "dark" };
  }
  return { ...getBrandPalette(brand), style: "dark", textStyle: "light" };
}

// Extract color description from title for accurate product rendering
function extractProductColor(title = "") {
  const t = title.toLowerCase();
  const colorMap = [
    { keys: ["quartzo rosa", "quartz", "rosa", "pink", "rose"], label: "quartz pink/rose color" },
    { keys: ["branco", "white", "glacier"], label: "white" },
    { keys: ["preto", "black"], label: "black" },
    { keys: ["prata", "silver"], label: "silver" },
    { keys: ["azul", "blue"], label: "blue" },
    { keys: ["verde", "green"], label: "green" },
    { keys: ["vermelho", "red"], label: "red" },
  ];
  for (const { keys, label } of colorMap) {
    if (keys.some(k => t.includes(k))) return label;
  }
  return "";
}

// ---------------------------------------------------------------------------
// Daily batch — selects top N deals of the day and generates Instagram posts
// ---------------------------------------------------------------------------

export async function runDailyInstagramBatch(db, config, maxPosts = 3) {
  if (!config.anthropicApiKey) return;

  const today = new Date().toISOString().slice(0, 10);
  const topDeals = selectTopDealsOfDay(db, today, maxPosts);

  if (!topDeals.length) {
    console.log("instagram_batch_skip", JSON.stringify({ reason: "no_deals_today", date: today }));
    return;
  }

  console.log("instagram_batch_start", JSON.stringify({ date: today, count: topDeals.length, titles: topDeals.map(d => d.title?.slice(0, 40)) }));

  for (const offer of topDeals) {
    await generateInstagramContent(db, config, offer, { imageUrls: offer.imageUrls }, null).catch(err =>
      console.log("instagram_batch_error", JSON.stringify({ offerId: offer.id, error: err.message }))
    );
  }
}

export function selectTopDealsOfDay(db, date, maxCount = 3) {
  const published = (db.state.publishLog || [])
    .filter(e => e.channel === "telegram" && e.result?.ok === true && e.createdAt?.startsWith(date))
    .map(e => (db.state.offers || []).find(o => o.id === e.offerId))
    .filter(Boolean);

  if (!published.length) return [];

  // Score each deal: discount % (50%) + rating (30%) + brand tier (20%)
  const scored = published.map(offer => {
    const discount = Number(offer.discountPercent || 0);
    const rating = Number(offer.rating || 0);
    const brand = extractPremiumBrand(offer, {});
    const brandScore = brand.tier === "premium" ? 20 : 0;
    const score = (discount * 0.5) + (rating * 6) + brandScore;
    return { offer, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Dedupe by brand — max 1 per brand in the top selection
  const seen = new Set();
  const top = [];
  for (const { offer } of scored) {
    const brand = extractPremiumBrand(offer, {}).name || "unknown";
    if (!seen.has(brand)) {
      seen.add(brand);
      top.push(offer);
    }
    if (top.length >= maxCount) break;
  }

  return top;
}

// ---------------------------------------------------------------------------
// Per-deal entry point (can also be called manually)
// ---------------------------------------------------------------------------

export async function generateInstagramContent(db, config, offer, content, affiliateUrl) {
  if (!config.braveSearchApiKey && !config.anthropicApiKey) return;
  if (!config.anthropicApiKey) return;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const outDir = join(OUTPUT_BASE, today, offer.id);
    await mkdir(join(outDir, "slides"), { recursive: true });

    console.log("instagram_agent_start", JSON.stringify({ offerId: offer.id, title: offer.title?.slice(0, 60) }));

    // 1. Research official brand posts to determine format
    const research = await researchOfficialPost(offer, config);

    // 2. Save brief for transparency
    await writeFile(join(outDir, "brief.json"), JSON.stringify({ offer: { id: offer.id, title: offer.title, brand: research.brand, asin: offer.asin }, research }, null, 2));

    // 3. Render logo watermark (SVG → transparent PNG)
    const logoWatermark = await renderLogoWatermark(outDir);

    // 4. Generate content in the same format the brand used
    let slideCount = 0;
    if (research.contentType === "reel") {
      slideCount = await generateProductReel(offer, content, research, outDir, logoWatermark, config);
    } else if (research.contentType === "carousel") {
      slideCount = await generateCarousel(offer, content, research, outDir, logoWatermark, config);
    } else {
      slideCount = await generateSinglePost(offer, content, research, outDir, logoWatermark, config);
    }

    // 4. Caption
    const caption = await generateCaption(offer, research, config);
    await writeFile(join(outDir, "legenda.txt"), caption);

    console.log("instagram_content_ready", JSON.stringify({ offerId: offer.id, type: research.contentType, slides: slideCount, dir: outDir }));
  } catch (err) {
    console.log("instagram_agent_error", JSON.stringify({ offerId: offer.id, error: err.message }));
  }
}

// ---------------------------------------------------------------------------
// Research — find how brand officially posted about this product
// ---------------------------------------------------------------------------

async function researchOfficialPost(offer, config) {
  const brand = extractPremiumBrand(offer, {}).name || extractBrandFromTitle(offer.title);
  const productShort = cleanProductName(offer.title, brand);

  let contentType = "single"; // default
  let officialContext = "";
  let officialUrl = "";

  if (config.braveSearchApiKey) {
    try {
      // 1. Search for brand official Instagram post — try both model name and full product name
      const queries = [
        `site:instagram.com ${brand} ${productShort}`,
        `site:instagram.com "${brand}" headset OR mouse OR keyboard OR monitor OR tablet`,
      ];
      for (const query of queries) {
        const results = await braveSearch(query, config.braveSearchApiKey);
        for (const r of results.slice(0, 5)) {
          const url = r.url || "";
          if (url.includes("instagram.com")) {
            officialUrl = url;
            if (url.includes("/reel/")) {
              contentType = "reel";
            } else if (url.includes("/p/")) {
              const desc = (r.description || "").toLowerCase();
              contentType = (desc.includes("swipe") || desc.includes("deslize") || desc.includes("tap") || desc.includes("carousel")) ? "carousel" : "single";
            }
            officialContext = r.description || r.title || "";
            break;
          }
        }
        if (officialUrl) break;
      }

      // 2. Always fetch product editorial context from web (review sites, brand site)
      const ctxQuery = `${brand} ${productShort} review especificações características`;
      const ctxResults = await braveSearch(ctxQuery, config.braveSearchApiKey);
      const webContext = ctxResults
        .filter(r => !r.url?.includes("amazon.com"))
        .slice(0, 3)
        .map(r => r.description || r.title || "")
        .join(" ")
        .slice(0, 500);

      if (webContext) officialContext = (officialContext + " " + webContext).trim().slice(0, 500);

    } catch {
      // Search failed — use default
    }
  }

  return { brand, productShort, contentType, officialContext, officialUrl };
}

// ---------------------------------------------------------------------------
// Carousel (9 slides) — mirrors carousel brand posts
// ---------------------------------------------------------------------------

async function generateCarousel(offer, content, research, outDir, logoWatermark, config) {
  const { brand, productShort, officialContext } = research;
  const imageUrl = getBestImageUrl(offer, content);

  // Upload product image reference if available
  let productUuid = null;
  if (imageUrl) {
    try {
      const tmpImg = join(outDir, "product-ref.jpg");
      await downloadFile(imageUrl, tmpImg);
      productUuid = await higgsUpload(tmpImg);
    } catch { /* best-effort */ }
  }

  // Upload logo
  const logoUuid = existsSync(LOGO_PNG_FALLBACK) ? await higgsUpload(LOGO_PNG_FALLBACK).catch(() => null) : null;

  const visualBrief = buildVisualBrief();
  const slides = buildCarouselSlides(offer, brand, productShort, officialContext);

  // Generate cover first
  const coverPrompt = buildSlidePrompt(slides[0], visualBrief, brand);
  const coverJob = await higgsGenerate(coverPrompt, "3:4", [logoUuid, productUuid].filter(Boolean));
  const coverUrl = await higgsWait(coverJob);
  const coverPath = join(outDir, "slides", "slide-01.png");
  await downloadFile(coverUrl, coverPath);

  // Upload cover for reference on internal slides
  const coverUuid = await higgsUpload(coverPath).catch(() => null);
  const baseRefs = [coverUuid, logoUuid, productUuid].filter(Boolean);

  // Generate slides 2-9 in parallel
  const internalJobs = await Promise.all(
    slides.slice(1).map(async (slide, i) => {
      const prompt = buildSlidePrompt(slide, visualBrief, brand);
      const job = await higgsGenerate(prompt, "3:4", baseRefs);
      return { n: i + 2, job };
    })
  );

  for (const { n, job } of internalJobs) {
    try {
      const url = await higgsWait(job);
      const padded = String(n).padStart(2, "0");
      const slidePath = join(outDir, "slides", `slide-${padded}.png`);
      await downloadFile(url, slidePath);
      await applyWatermark(slidePath, logoWatermark);
    } catch { /* skip failed slides */ }
  }
  await applyWatermark(coverPath, logoWatermark);
  return slides.length;
}

// ---------------------------------------------------------------------------
// 3-image carousel — SDM style: text only on first, clean angles on 2 and 3
// ---------------------------------------------------------------------------

async function generateSinglePost(offer, content, research, outDir, logoWatermark, config) {
  const { brand, productShort, officialContext } = research;
  const imageUrl = getBestImageUrl(offer, content);
  const palette = detectBackground(offer.title, brand);

  let productUuid = null;
  if (imageUrl) {
    try {
      const tmpImg = join(outDir, "product-ref.jpg");
      await downloadFile(imageUrl, tmpImg);
      productUuid = await higgsUpload(tmpImg);
    } catch { /* best-effort */ }
  }
  const logoUuid = existsSync(LOGO_PNG_FALLBACK) ? await higgsUpload(LOGO_PNG_FALLBACK).catch(() => null) : null;
  const refs = [logoUuid, productUuid].filter(Boolean);

  // Generate headline for slide 1 via Claude Haiku
  const headline = await generateHeadline(offer, brand, productShort, config);

  // Slide 1: product hero WITH text overlay (SDM style — bold headline at bottom)
  const prompt1 = buildSlide1WithText(offer, brand, productShort, palette, headline);
  // Slide 2: three-quarter back-left angle — shows depth and form differently from slide 1
  const prompt2 = buildCleanAnglePrompt(offer, brand, productShort, palette, "three-quarter view from above-left (45° elevation, 45° horizontal), showing the product's top and left side simultaneously, revealing depth and form");
  // Slide 3: extreme close-up of the most iconic branded detail
  const prompt3 = buildCleanAnglePrompt(offer, brand, productShort, palette, "extreme macro close-up of the most iconic detail or branded element of the product, shallow depth of field, background blurred");

  // Launch all 3 in parallel
  const [job1, job2, job3] = await Promise.all([
    higgsGenerate(prompt1, "3:4", refs, "gpt_image_2"),
    higgsGenerate(prompt2, "3:4", refs, "gpt_image_2"),
    higgsGenerate(prompt3, "3:4", refs, "gpt_image_2"),
  ]);

  const urls = await Promise.all([
    higgsWait(job1),
    higgsWait(job2).catch(() => null),
    higgsWait(job3).catch(() => null),
  ]);

  let count = 0;
  for (let i = 0; i < urls.length; i++) {
    if (!urls[i]) continue;
    const p = join(outDir, "slides", `slide-0${i + 1}.png`);
    await downloadFile(urls[i], p);
    await applyWatermark(p, logoWatermark);
    count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Reel (product showcase video) — mirrors reel brand posts
// ---------------------------------------------------------------------------

async function generateProductReel(offer, content, research, outDir, logoWatermark, config) {
  const { brand, productShort, officialContext } = research;
  const imageUrl = getBestImageUrl(offer, content);

  let productUuid = null;
  if (imageUrl) {
    try {
      const tmpImg = join(outDir, "product-ref.jpg");
      await downloadFile(imageUrl, tmpImg);
      productUuid = await higgsUpload(tmpImg);
    } catch { /* best-effort */ }
  }

  // Generate a hero still first (for reel thumbnail + reference)
  const logoUuid = existsSync(LOGO_PNG_FALLBACK) ? await higgsUpload(LOGO_PNG_FALLBACK).catch(() => null) : null;
  const stillPrompt = buildSinglePostPrompt(offer, brand, productShort, officialContext);
  const stillJob = await higgsGenerate(stillPrompt, "9:16", [logoUuid, productUuid].filter(Boolean), "nano_banana_2");
  const stillUrl = await higgsWait(stillJob);
  const stillPath = join(outDir, "slides", "reel-still.png");
  await downloadFile(stillUrl, stillPath);
  await applyWatermark(stillPath, logoWatermark);

  // Generate the video from the still
  const stillUuid = await higgsUpload(stillPath).catch(() => null);
  if (stillUuid) {
    try {
      const videoPrompt = buildReelVideoPrompt(offer, brand, productShort);
      const videoJob = await higgsGenerate(videoPrompt, "9:16", [stillUuid], "seedance_2_0");
      const videoUrl = await higgsWait(videoJob);
      const videoPath = join(outDir, "slides", "reel.mp4");
      await downloadFile(videoUrl, videoPath);
    } catch { /* video generation failed — still image serves as fallback */ }
  }

  return 1;
}

// ---------------------------------------------------------------------------
// Caption generator
// ---------------------------------------------------------------------------

async function generateCaption(offer, research, config) {
  if (!config.anthropicApiKey) return defaultCaption(offer, research.brand);

  try {
    const client = new Anthropic({ apiKey: config.anthropicApiKey });
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: `Gere uma legenda de Instagram para o produto abaixo. Regras obrigatórias:
- 2 a 4 linhas de texto informativo sobre o produto (não sobre promoção)
- Mencione reputação, caso de uso, ou público ideal
- Máximo 2 emojis no total
- NÃO mencione preços, valores ou desconto
- Penúltima linha: "Saiba mais na bio · @tdolinks"
- Última linha exatamente: "Post informativo. Não somos loja."

Produto: ${offer.title}
Marca: ${research.brand}
Contexto: ${research.officialContext?.slice(0, 200) || "produto tech premium"}
Categoria: ${offer.category || "tech"}`
      }]
    });
    return message.content?.[0]?.text?.trim() || defaultCaption(offer, research.brand);
  } catch {
    return defaultCaption(offer, research.brand);
  }
}

function defaultCaption(offer, brand) {
  const specs = extractKeySpecs(offer.title);
  const idealFor = inferIdealFor(offer.title, offer.category);
  const name = cleanProductName(offer.title, brand);
  return `${brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : "Tech"} ${name} — ${specs ? specs + "." : "produto bem avaliado."}\n\n${idealFor}\n\nSaiba mais na bio · @tdolinks\nPost informativo. Não somos loja.`;
}

// ---------------------------------------------------------------------------
// Slide content builders
// ---------------------------------------------------------------------------

function buildCarouselSlides(offer, brand, productShort, officialContext) {
  const category = (offer.category || "tech").toLowerCase();
  return [
    {
      role: "COVER",
      tag: null,
      headline: productShort.toUpperCase(),
      body: `${brand} · Em promoção agora`,
      imageSubject: `The ${productShort} product, ${category} device, dramatic dark studio lighting with orange #EC6227 rim glow`,
    },
    {
      role: "HOOK",
      tag: "SOBRE O CANAL",
      headline: "CURADORIA REAL, SEM HYPE",
      body: "Só publicamos quando o desconto é real e o produto tem histórico de qualidade.",
      imageSubject: null,
    },
    {
      role: "PRODUCT",
      tag: `DEAL — ${brand.toUpperCase()}`,
      headline: productShort.toUpperCase().slice(0, 40),
      body: extractKeySpecs(offer.title),
      cta: "Saiba mais na bio",
      imageSubject: `The ${productShort} product isolated, white background product shot, clean studio lighting`,
    },
    {
      role: "WHY",
      tag: "POR QUE VALE",
      headline: "FREQUENTEMENTE\nRECOMENDADO",
      body: officialContext?.slice(0, 150) || `${brand} é reconhecida pela qualidade e durabilidade dos produtos. Este modelo tem avaliação consistente entre os usuários.`,
      imageSubject: null,
    },
    {
      role: "SPECS",
      tag: "ESPECIFICAÇÕES",
      headline: "O QUE VOCÊ\nPRECISA SABER",
      body: extractKeySpecs(offer.title, true),
      imageSubject: null,
    },
    {
      role: "CONTEXT",
      tag: "PARA QUEM É",
      headline: "IDEAL PARA\nESTUDO E TRABALHO",
      body: inferIdealFor(offer.title, offer.category),
      imageSubject: null,
    },
    {
      role: "TRUST",
      tag: "AVALIAÇÃO",
      headline: offer.rating ? `${offer.rating}/5\nESTRELAS` : "BEM\nAVALIADO",
      body: offer.reviewCount ? `${offer.reviewCount.toLocaleString("pt-BR")} avaliações verificadas na Amazon Brasil.` : "Avaliação sólida na Amazon Brasil entre usuários verificados.",
      imageSubject: null,
    },
    {
      role: "LINK",
      tag: "ONDE ENCONTRAR",
      headline: "LINK NA BIO",
      body: "@tdolinks · t.me/tdolinks",
      imageSubject: null,
    },
    {
      role: "CTA",
      tag: null,
      headline: "LINKS NA BIO · @tdolinks",
      body: "Post informativo. Não somos loja.",
      imageSubject: null,
      isCta: true,
    },
  ];
}

function buildSlidePrompt(slide, visualBrief, brand) {
  const isLight = ["WHY", "SPECS", "CONTEXT", "TRUST", "LINK"].includes(slide.role);
  const bg = isLight ? "#ffffff" : "#0d0f14";
  const textColor = isLight ? "dark #1a1a1a" : "white";

  let txt = `A portrait Instagram carousel slide, aspect ratio 3:4. Background ${bg}.\n\n${visualBrief}\n\n`;
  txt += `Internal role: ${slide.role}. Do NOT render any page index, slide number or counter.\n\n`;

  if (slide.imageSubject) {
    txt += `═══ EMBEDDED IMAGE ═══\n${slide.imageSubject}\n\n`;
  }

  txt += `═══ TEXT CONTENT — render ALL this text inside the image ═══\n`;
  txt += `Brand bar (top, small, 45% opacity, ${textColor}): "TDO LINKS  |  @tdolinks  |  2026"\n`;
  if (slide.tag) txt += `Tag (small uppercase orange #EC6227): "${slide.tag}"\n`;
  txt += `Headline (bold condensed uppercase ${textColor}, largest element): "${slide.headline}"\n`;
  if (slide.body) txt += `Body (neutral sans, ${textColor} 70%, sentence case): "${slide.body}"\n`;
  if (slide.cta) txt += `CTA pill (solid orange #EC6227 background, white text, rounded corners): "${slide.cta}"\n`;
  txt += `Detail signature (very bottom, thin line above, 12px, 45% opacity ${textColor}): "2026 · @tdolinks"\n`;

  if (slide.isCta) {
    txt += `\n[The TDO eye logo (circular orange shape with white eye mark) is the dominant central visual element, large ~380px]`;
  }

  return txt;
}

function buildSinglePostPrompt(offer, brand, productShort, officialContext) {
  const palette = detectBackground(offer.title, brand);
  return buildCleanAnglePrompt(offer, brand, productShort, palette, "centered, slight upward angle, floating in space");
}

function buildCleanAnglePrompt(offer, brand, productShort, palette, angleDesc) {
  const color = extractProductColor(offer.title || "");
  const isWhiteBg = palette.style === "white";
  const bgDesc = isWhiteBg
    ? "Pure clean white background (#ffffff), professional product catalog style"
    : `Pure dark background ${palette.bg}`;
  const lightingDesc = isWhiteBg
    ? "Soft even studio lighting, slight shadow underneath product, clean catalog lighting"
    : `Dramatic ${palette.glowName} rim light (${palette.glow}) from camera-right. Deep chiaroscuro. ${palette.glowName} glow halo`;

  return `A portrait Instagram product post, aspect ratio 3:4. Premium product photography. NO TEXT, NO PRICE TAGS, NO WATERMARKS anywhere in the image.

Subject: The ${productShort} by ${brand}${color ? `, in ${color}` : ""}. ${angleDesc}.
CRITICAL: The ${brand} brand logo/symbol must be clearly visible on the product itself — it is part of the product design.
Background: ${bgDesc}.
Lighting: ${lightingDesc}.
Style: Official ${brand} marketing photography quality. Sharp product.
NO text overlays, NO price tags, NO watermarks, NO extra badges in image.`;
}

function buildSlide1WithText(offer, brand, productShort, palette, headline) {
  const color = extractProductColor(offer.title || "");
  const isWhiteBg = palette.style === "white";
  const bgDesc = isWhiteBg
    ? "Pure clean white background (#ffffff)"
    : `Dark background ${palette.bg}`;
  const lightingDesc = isWhiteBg
    ? "Soft even studio lighting, slight shadow underneath, clean catalog style"
    : `Dramatic ${palette.glowName} rim light (${palette.glow}) wrapping edges`;
  const gradientDesc = isWhiteBg
    ? "light-to-transparent gradient overlay at the bottom (white fading to transparent from bottom up) to ensure dark text legibility"
    : "dark gradient overlay at the bottom (transparent at mid-frame, solid dark at bottom) for white text legibility";
  const textColor = isWhiteBg ? "dark #1a1a1a bold" : "white bold";
  const subtitleColor = isWhiteBg ? "dark #444 regular" : "white 80% regular";

  return `A portrait Instagram carousel first slide, aspect ratio 3:4. SDM Links editorial style — product hero with bold text overlay at bottom.

Subject: The ${productShort} by ${brand}${color ? `, in ${color}` : ""}. Centered, hero composition.
CRITICAL: The ${brand} brand logo must be clearly visible on the product.
Background: ${bgDesc}.
Lighting: ${lightingDesc}. Sharp product focus.

COMPOSITION: Product occupies upper 60% of frame. Lower 40% has ${gradientDesc}.

TEXT OVERLAY (render as crisp legible typography inside the image):
- Headline (${textColor}, heavy condensed, ~30px, 2 lines max, left-aligned, 32px left margin): "${headline.headline}"
- Subtitle (${subtitleColor}, ~16px, 1 line, left-aligned, 32px left margin, below headline): "${headline.subtitle}"
Both in the lower 35% of the frame over the gradient.

NO watermarks, NO brand logos outside product itself in the image.`;
}

async function generateHeadline(offer, brand, productShort, config) {
  const defaultHeadline = {
    headline: `${brand.charAt(0).toUpperCase() + brand.slice(1)} ${productShort} em promoção`,
    subtitle: "Disponível em link na bio."
  };

  if (!config.anthropicApiKey) return defaultHeadline;

  try {
    const client = new Anthropic({ apiKey: config.anthropicApiKey });
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 120,
      messages: [{
        role: "user",
        content: `Crie um headline estilo SDM Links para um post de Instagram sobre este produto em promoção.
Produto: ${offer.title?.slice(0, 100)}
Marca: ${brand}
Desconto: ${offer.discountPercent}%

Retorne SOMENTE JSON:
{"headline": "até 60 chars, bold, direto, como notícia ou statement forte", "subtitle": "até 45 chars, 1 linha, encerra com 'Disponível em link na bio.'"}

Exemplos de tom:
- "O headset da Razer mais recomendado está em promoção"
- "Mouse profissional da Logitech com desconto real"
Sem emojis no JSON.`
      }]
    });
    const raw = msg.content?.[0]?.text || "{}";
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : {};
    return {
      headline: parsed.headline || defaultHeadline.headline,
      subtitle: parsed.subtitle || defaultHeadline.subtitle,
    };
  } catch {
    return defaultHeadline;
  }
}

function buildReelVideoPrompt(offer, brand, productShort) {
  return `Cinematic product reveal video. ${productShort} by ${brand}. Slow 360 rotation on dark background with orange rim lighting. Premium product showcase. No text overlay. No music. No people. Duration 15 seconds.`;
}

function buildVisualBrief() {
  return `VISUAL BRIEF — TDO Links brand:
Color palette: primary #EC6227 orange, dark background #0d0f14, light #ffffff, text white on dark / dark #1a1a1a on light.
Typography: ultra-bold condensed sans-serif headlines (uppercase, weight 900), clean neutral sans-serif body (regular).
Brand bar (top of every slide, small, 45% opacity).
Detail signature (bottom of every slide, thin line + small text): "2026 · @tdolinks"
Accent bar: 6px orange line at very top.
NO emojis, NO prices, NO people, NO stock photos, NO gradients.`;
}

// ---------------------------------------------------------------------------
// Higgsfield CLI helpers
// ---------------------------------------------------------------------------

async function higgsUpload(filePath) {
  const { stdout } = await exec("higgsfield", ["upload", "create", filePath], { timeout: 60000 });
  const match = stdout.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (!match) throw new Error(`Upload failed: ${stdout}`);
  return match[0];
}

async function higgsGenerate(prompt, aspectRatio, imageUuids = [], model = "gpt_image_2") {
  const args = ["generate", "create", model, "--prompt", prompt, "--aspect_ratio", aspectRatio, "--resolution", "2k"];
  if (model === "gpt_image_2") args.push("--quality", "high");
  for (const uuid of imageUuids) args.push("--image", uuid);
  const { stdout } = await exec("higgsfield", args, { timeout: 60000 });
  const match = stdout.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (!match) throw new Error(`Generate failed: ${stdout}`);
  return match[0];
}

async function higgsWait(jobId, timeoutMs = 300000) {
  const { stdout } = await exec("higgsfield", ["generate", "wait", jobId], { timeout: timeoutMs });
  const match = stdout.match(/https:\/\/[^\s"]+\.(png|jpg|mp4)/i);
  if (!match) throw new Error(`Wait failed: ${stdout}`);
  return match[0];
}

// ---------------------------------------------------------------------------
// Watermark (Python Pillow) — 100% opacity, bottom-right corner
// ---------------------------------------------------------------------------

async function renderLogoWatermark(outDir) {
  // Convert SVG (white/transparent) to PNG using resvg-js if available
  const pngPath = join(outDir, "logo-watermark.png");
  try {
    const script = `
const {Resvg} = require('/tmp/node_modules/@resvg/resvg-js');
const fs = require('fs');
const svg = fs.readFileSync(process.argv[1]);
const r = new Resvg(svg, { fitTo: { mode: 'width', value: 220 } });
fs.writeFileSync(process.argv[2], r.render().asPng());
`;
    await exec("node", ["-e", script, LOGO_SVG_PATH, pngPath], { timeout: 15000 });
    return pngPath;
  } catch {
    // Fallback: use PNG version and remove orange background
    if (existsSync(LOGO_PNG_FALLBACK)) return LOGO_PNG_FALLBACK;
    return null;
  }
}

async function applyWatermark(imagePath, logoPath) {
  if (!logoPath || !existsSync(logoPath)) return;
  const isOrangeBg = logoPath.includes("Group 5") || logoPath.includes("Group 6");
  const script = `
from PIL import Image
import sys
base_path, logo_path, remove_bg = sys.argv[1], sys.argv[2], sys.argv[3] == '1'
base = Image.open(base_path).convert("RGBA")
logo = Image.open(logo_path).convert("RGBA")
if remove_bg:
    # Remove orange background, keep white text
    data = logo.load()
    for y in range(logo.height):
        for x in range(logo.width):
            r,g,b,a = data[x,y]
            if r > 150 and g < 120 and b < 80:
                data[x,y] = (r,g,b,0)
# 9% of base width — upper-right corner with 30px padding from edges
w = max(55, int(base.width * 0.09))
h = int(logo.height * (w / logo.width))
logo = logo.resize((w, h), Image.LANCZOS)
padding = 30
x = base.width - w - padding   # right edge - logo width - 30px
y = padding                     # 30px from top
out = Image.new("RGBA", base.size)
out.paste(base, (0,0))
out.paste(logo, (x, y), logo)
out.convert("RGB").save(base_path, quality=95)
`;
  await exec("python3", ["-c", script, imagePath, logoPath, isOrangeBg ? "1" : "0"], { timeout: 30000 });
}

// ---------------------------------------------------------------------------
// Brave Search
// ---------------------------------------------------------------------------

async function braveSearch(query, apiKey) {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&search_lang=pt`;
  const res = await fetch(url, { headers: { "Accept": "application/json", "X-Subscription-Token": apiKey } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.web?.results || []);
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function extractBrandFromTitle(title = "") {
  const brands = ["Logitech", "Razer", "HyperX", "Samsung", "LG", "Apple", "Sony", "JBL", "Anker", "Soundcore", "Dell", "ASUS", "Lenovo", "MSI", "AOC", "Gigabyte", "Kingston", "Corsair", "SteelSeries", "TP-Link"];
  for (const b of brands) {
    if (title.toLowerCase().includes(b.toLowerCase())) return b;
  }
  return title.split(" ")[0];
}

function cleanProductName(title = "", brand = "") {
  // Try to extract the model name — text before the first colon/dash/comma or last 4 words
  let clean = title
    .replace(new RegExp(brand, "gi"), "")
    .replace(/Fone de ouvido para jogos|Fone de ouvido|Headset Gamer|Mouse Gamer|Teclado Gamer|Tablet|Smart TV|Notebook/gi, "")
    .split(/[:\-–,]/)[0]  // take only first segment before any colon/dash
    .replace(/\s+/g, " ")
    .trim();

  // If still too long, take first 3-4 meaningful words
  const words = clean.split(" ").filter(w => w.length > 1);
  if (words.length > 5) clean = words.slice(0, 4).join(" ");

  return clean.slice(0, 40) || title.slice(0, 40);
}

function extractKeySpecs(title = "", detailed = false) {
  const specs = [];
  const patterns = [
    /(\d+(?:\.\d+)?\s*(?:GB|TB|GHz|MHz|Hz|mm|cm|W|mAh|MP|K|kg|g)\b)/gi,
    /(sem fio|wireless|bluetooth|wi-fi|usb-c|hdmi|type-c)/gi,
    /(ultraleve|impermeável|ip\d+|recarregável)/gi,
  ];
  for (const p of patterns) {
    const matches = title.match(p) || [];
    specs.push(...matches.slice(0, detailed ? 4 : 2));
  }
  return specs.length ? specs.join(" · ") : title.slice(0, 80);
}

function inferIdealFor(title = "", category = "") {
  const t = title.toLowerCase();
  if (t.includes("gamer") || t.includes("gaming")) return "Gamers que querem performance sem abrir mão do conforto.";
  if (t.includes("notebook") || t.includes("laptop")) return "Profissionais e estudantes que precisam de mobilidade.";
  if (t.includes("tablet")) return "Ideal para estudos, trabalho e entretenimento em tela grande.";
  if (t.includes("fone") || t.includes("headset") || t.includes("earbud")) return "Para quem valoriza áudio de qualidade no dia a dia.";
  if (t.includes("monitor") || t.includes("display")) return "Criadores de conteúdo e profissionais que precisam de precisão visual.";
  if (t.includes("mouse") || t.includes("teclado")) return "Usuários que passam horas no computador e querem ergonomia.";
  return "Para quem busca qualidade e custo-benefício real em tech.";
}

function getBestImageUrl(offer, content) {
  return offer.officialImageUrls?.[0] || content?.imageUrls?.[0] || offer.imageUrls?.[0] || offer.imageUrl || null;
}

async function downloadFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}
