import { mkdir, writeFile, readFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { extractPremiumBrand } from "../premium-curation.js";

const exec = promisify(execFile);

const LOGO_PATH = resolve("/Users/antonio/Projects/TDO LINKS/Logo/Logo 01/Group 6.png");
const OUTPUT_BASE = resolve(process.env.HOME || "/tmp", "Documents/human-output/instagram");

// ---------------------------------------------------------------------------
// Entry point — called from publishSecondary(), best-effort
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

    // 3. Generate content in the same format the brand used
    let slideCount = 0;
    if (research.contentType === "reel") {
      slideCount = await generateProductReel(offer, content, research, outDir, config);
    } else if (research.contentType === "carousel") {
      slideCount = await generateCarousel(offer, content, research, outDir, config);
    } else {
      slideCount = await generateSinglePost(offer, content, research, outDir, config);
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
      // Search for brand official Instagram post about this product
      const query = `site:instagram.com "${brand}" "${productShort}"`;
      const results = await braveSearch(query, config.braveSearchApiKey);

      for (const r of results.slice(0, 5)) {
        const url = r.url || "";
        if (url.includes("instagram.com")) {
          officialUrl = url;
          // Detect format from URL pattern
          if (url.includes("/reel/")) {
            contentType = "reel";
          } else if (url.includes("/p/")) {
            // Carousel vs single: try to detect from description
            const desc = (r.description || "").toLowerCase();
            if (desc.includes("swipe") || desc.includes("carousel") || desc.includes("deslize") || desc.includes("imagens")) {
              contentType = "carousel";
            } else {
              contentType = "single";
            }
          }
          officialContext = r.description || r.title || "";
          break;
        }
      }

      // Also search general product context
      if (!officialContext) {
        const ctxQuery = `"${brand}" "${productShort}" review caracteristicas`;
        const ctxResults = await braveSearch(ctxQuery, config.braveSearchApiKey);
        officialContext = ctxResults.slice(0, 2).map(r => r.description || r.title).join(" ").slice(0, 400);
      }
    } catch {
      // Search failed — use default single format
    }
  }

  return { brand, productShort, contentType, officialContext, officialUrl };
}

// ---------------------------------------------------------------------------
// Carousel (9 slides) — mirrors carousel brand posts
// ---------------------------------------------------------------------------

async function generateCarousel(offer, content, research, outDir, config) {
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
  const logoUuid = existsSync(LOGO_PATH) ? await higgsUpload(LOGO_PATH).catch(() => null) : null;

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
      await applyWatermark(slidePath);
    } catch { /* skip failed slides */ }
  }
  await applyWatermark(coverPath);
  return slides.length;
}

// ---------------------------------------------------------------------------
// Single post — mirrors single image brand posts
// ---------------------------------------------------------------------------

async function generateSinglePost(offer, content, research, outDir, config) {
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
  const logoUuid = existsSync(LOGO_PATH) ? await higgsUpload(LOGO_PATH).catch(() => null) : null;

  const prompt = buildSinglePostPrompt(offer, brand, productShort, officialContext);
  const job = await higgsGenerate(prompt, "4:5", [logoUuid, productUuid].filter(Boolean), "nano_banana_2");
  const url = await higgsWait(job);
  const outPath = join(outDir, "slides", "post-01.png");
  await downloadFile(url, outPath);
  await applyWatermark(outPath);
  return 1;
}

// ---------------------------------------------------------------------------
// Reel (product showcase video) — mirrors reel brand posts
// ---------------------------------------------------------------------------

async function generateProductReel(offer, content, research, outDir, config) {
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
  const logoUuid = existsSync(LOGO_PATH) ? await higgsUpload(LOGO_PATH).catch(() => null) : null;
  const stillPrompt = buildSinglePostPrompt(offer, brand, productShort, officialContext);
  const stillJob = await higgsGenerate(stillPrompt, "9:16", [logoUuid, productUuid].filter(Boolean), "nano_banana_2");
  const stillUrl = await higgsWait(stillJob);
  const stillPath = join(outDir, "slides", "reel-still.png");
  await downloadFile(stillUrl, stillPath);
  await applyWatermark(stillPath);

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
  return `${offer.title?.slice(0, 80)} — produto ${brand || "tech"} bem avaliado.\n\nSaiba mais na bio · @tdolinks\nPost informativo. Não somos loja.`;
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
  return `A portrait Instagram post, aspect ratio 4:5. This is a cinematic product hero shot.

${buildVisualBrief()}

Subject: The ${productShort} by ${brand}. Single hero product against dramatic dark #0d0f14 background.
Lighting: Rim light in orange #EC6227 from camera-right, chiaroscuro, deep shadows, product focus sharp.
Composition: Product occupies 65% of frame, left-aligned at rule of thirds, text in lower-right.
Style: Editorial product photography, cinematic, no people, no lifestyle.

═══ TEXT CONTENT ═══
Brand bar (top, white 45% opacity, small): "TDO LINKS  |  @tdolinks  |  2026"
Headline (bold condensed uppercase white): "${productShort.toUpperCase()}"
Subhead (white 70%, small): "${brand} · Saiba mais na bio"
Detail signature (bottom): "2026 · @tdolinks"

NO emojis, NO prices, NO numbers except year in brand bar.`;
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

async function applyWatermark(imagePath) {
  if (!existsSync(LOGO_PATH)) return;
  const script = `
from PIL import Image
import sys
base_path, logo_path = sys.argv[1], sys.argv[2]
base = Image.open(base_path).convert("RGBA")
logo = Image.open(logo_path).convert("RGBA")
# 7% of base width
w = max(40, int(base.width * 0.07))
h = int(logo.height * (w / logo.width))
logo = logo.resize((w, h), Image.LANCZOS)
margin = int(base.width * 0.04)
x = base.width - w - margin
y = base.height - h - margin
out = Image.new("RGBA", base.size)
out.paste(base, (0,0))
out.paste(logo, (x, y), logo)
out.convert("RGB").save(base_path, quality=95)
`;
  await exec("python3", ["-c", script, imagePath, LOGO_PATH], { timeout: 30000 });
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
  return title
    .replace(new RegExp(brand, "gi"), "")
    .replace(/\b(com|para|de|e|sem|fio|cabo|adaptador|versão|GB|TB|MHz|GHz|Hz)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
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
