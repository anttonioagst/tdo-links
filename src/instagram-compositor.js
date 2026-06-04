import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(__dirname, "..", "public", "brand-assets");
const FONTS  = join(__dirname, "..", "public", "fonts");

// Canvas dimensions (pixel-perfect from Figma)
const W  = 1080;
const H  = 1440;
const BG = "#171717";

// ─── Layout tokens (Figma coordinates, 1:1) ─────────────────────────────────

const COVER = {
  logoIcon:     { x: 36,  y: 47,   w: 68,  h: 54  },
  logoWordmark: { x: 37,  y: 1175, w: 190, h: 54  },
  bookmark:     { x: 37,  y: 1358, w: 20,  h: 30  },
  heart:        { x: 80,  y: 1358, w: 34,  h: 30  },
  // Text
  productText:  { x: 377, y: 1156, maxW: 590, fontSize: 100, lineH: 112 },
  tagline1:     { x: 37,  y: 1247, fontSize: 16, lineH: 20 }, // "NÃO SOMOS / UMA LOJA"
  tagline2:     { x: 37,  y: 1303, fontSize: 16, lineH: 20 }, // "DESCONTOS / EXCLUSIVOS"
};

const INNER = {
  logoIcon:  { x: 36,  y: 47,   w: 68,  h: 54  },
  bookmark:  { x: 37,  y: 1358, w: 20,  h: 30  },
  heart:     { x: 80,  y: 1358, w: 34,  h: 30  },
  wordmark:  { x: 181, y: 1358, w: 105, h: 30  },
  arrow:     { x: 819, y: 1351, w: 161, h: 14  },
};

// ─── Font cache (read once per process) ─────────────────────────────────────

let _fontSemiBoldB64   = null;
let _fontExtraLightB64 = null;

async function getFonts() {
  if (!_fontSemiBoldB64) {
    try {
      _fontSemiBoldB64   = (await readFile(join(FONTS, "Inter-SemiBold.ttf"))).toString("base64");
      _fontExtraLightB64 = (await readFile(join(FONTS, "Inter-ExtraLight.ttf"))).toString("base64");
    } catch {
      _fontSemiBoldB64   = "";
      _fontExtraLightB64 = "";
    }
  }
  return { semiBold: _fontSemiBoldB64, extraLight: _fontExtraLightB64 };
}

function fontFaceDefs(semiBold, extraLight) {
  if (!semiBold) return "";
  return `
    <defs>
      <style>
        @font-face {
          font-family: 'Inter';
          font-weight: 600;
          src: url('data:font/truetype;base64,${semiBold}') format('truetype');
        }
        @font-face {
          font-family: 'Inter';
          font-weight: 200;
          src: url('data:font/truetype;base64,${extraLight}') format('truetype');
        }
      </style>
    </defs>`;
}

// ─── SVG builders ────────────────────────────────────────────────────────────

function esc(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function makeCoverSVG(productLine, brandName, fontDefs) {
  const l = COVER;

  // Product name: up to 2 lines, large semibold
  // Figma baseline: text box top = 1156, font-size = 100, line-height = 112
  const line1Y = l.productText.y + l.productText.fontSize;     // ~1256
  const line2Y = line1Y + l.productText.lineH;                  // ~1368

  // Taglines: 2 lines each, extralight 16px
  const tl1a = l.tagline1.y + l.tagline1.fontSize;              // ~1263
  const tl1b = tl1a + l.tagline1.lineH;                         // ~1283
  const tl2a = l.tagline2.y + l.tagline2.fontSize;              // ~1319
  const tl2b = tl2a + l.tagline2.lineH;                         // ~1339

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${fontDefs}
    <!-- Product name — right column -->
    <text x="${l.productText.x}" y="${line1Y}"
          font-family="Inter, 'Helvetica Neue', Arial, sans-serif"
          font-weight="600" font-size="${l.productText.fontSize}"
          fill="white">${esc(productLine)}</text>
    <text x="${l.productText.x}" y="${line2Y}"
          font-family="Inter, 'Helvetica Neue', Arial, sans-serif"
          font-weight="600" font-size="${l.productText.fontSize}"
          fill="white">${esc(brandName)}</text>
    <!-- Tagline 1: NÃO SOMOS / UMA LOJA -->
    <text x="${l.tagline1.x}" y="${tl1a}"
          font-family="Inter, 'Helvetica Neue', Arial, sans-serif"
          font-weight="200" font-size="${l.tagline1.fontSize}"
          fill="white">NÃO SOMOS</text>
    <text x="${l.tagline1.x}" y="${tl1b}"
          font-family="Inter, 'Helvetica Neue', Arial, sans-serif"
          font-weight="200" font-size="${l.tagline1.fontSize}"
          fill="white">UMA LOJA</text>
    <!-- Tagline 2: DESCONTOS / EXCLUSIVOS -->
    <text x="${l.tagline2.x}" y="${tl2a}"
          font-family="Inter, 'Helvetica Neue', Arial, sans-serif"
          font-weight="200" font-size="${l.tagline2.fontSize}"
          fill="white">DESCONTOS</text>
    <text x="${l.tagline2.x}" y="${tl2b}"
          font-family="Inter, 'Helvetica Neue', Arial, sans-serif"
          font-weight="200" font-size="${l.tagline2.fontSize}"
          fill="white">EXCLUSIVOS</text>
  </svg>`;
}

function makeInnerSVG(fontDefs) {
  const l = INNER;
  // Arrow: horizontal line + arrowhead at x2
  const ax1 = l.arrow.x;
  const ax2 = l.arrow.x + l.arrow.w;
  const ay  = l.arrow.y + Math.round(l.arrow.h / 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${fontDefs}
    <!-- Arrow → -->
    <line x1="${ax1}" y1="${ay}" x2="${ax2 - 8}" y2="${ay}"
          stroke="white" stroke-width="1.5"/>
    <polyline points="${ax2 - 10},${ay - 6} ${ax2},${ay} ${ax2 - 10},${ay + 6}"
              fill="none" stroke="white" stroke-width="1.5"/>
  </svg>`;
}

// ─── Asset composite helpers ─────────────────────────────────────────────────

async function loadAsset(filename, targetW, targetH) {
  const buf = await readFile(join(ASSETS, filename));
  return sharp(buf).resize(targetW, targetH, { fit: "fill" }).toBuffer();
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * composeCover
 * productImagePath — path to Higgsfield-generated clean product photo
 * productLine      — short product name, e.g. "Headset BlackShark"
 * brandName        — brand name, e.g. "Razer"
 * outPath          — where to write the final PNG
 */
export async function composeCover(productImagePath, { productLine, brandName, outPath }) {
  const { semiBold, extraLight } = await getFonts();
  const fontDefs = fontFaceDefs(semiBold, extraLight);

  // 1. Product image: fill top 1140px of canvas (leaves room for footer)
  const productBuf = await sharp(productImagePath)
    .resize(W, 1140, { fit: "cover", position: "top" })
    .toBuffer();

  // 2. Canvas: dark bg 1080x1440, product image in top area
  const canvas = await sharp({
    create: { width: W, height: H, channels: 4, background: BG },
  })
    .composite([{ input: productBuf, top: 0, left: 0 }])
    .png()
    .toBuffer();

  // 3. Load PNG assets (Figma pixel-perfect positions)
  const [logoIcon, logoWordmark, bookmark, heart] = await Promise.all([
    loadAsset("logo-icon.png",     COVER.logoIcon.w,     COVER.logoIcon.h),
    loadAsset("logo-wordmark.png", COVER.logoWordmark.w, COVER.logoWordmark.h),
    loadAsset("icon-bookmark.png", COVER.bookmark.w,     COVER.bookmark.h),
    loadAsset("icon-heart.png",    COVER.heart.w,        COVER.heart.h),
  ]);

  // 4. SVG text overlay
  const svgBuf = Buffer.from(makeCoverSVG(productLine, brandName, fontDefs));

  // 5. Composite all layers in z-order
  await sharp(canvas)
    .composite([
      { input: svgBuf,        top: 0,                    left: 0                    }, // text
      { input: logoIcon,      top: COVER.logoIcon.y,     left: COVER.logoIcon.x     },
      { input: logoWordmark,  top: COVER.logoWordmark.y, left: COVER.logoWordmark.x },
      { input: bookmark,      top: COVER.bookmark.y,     left: COVER.bookmark.x     },
      { input: heart,         top: COVER.heart.y,        left: COVER.heart.x        },
    ])
    .jpeg({ quality: 95 })
    .toFile(outPath);
}

/**
 * composeInternalSlide
 * productImagePath — clean product photo from Higgsfield
 * outPath          — output path
 */
export async function composeInternalSlide(productImagePath, { outPath }) {
  const { semiBold, extraLight } = await getFonts();
  const fontDefs = fontFaceDefs(semiBold, extraLight);

  // 1. Product image fullbleed
  const productBuf = await sharp(productImagePath)
    .resize(W, H, { fit: "cover", position: "center" })
    .toBuffer();

  // 2. Load PNG assets
  const wordmarkResized = await sharp(await readFile(join(ASSETS, "logo-wordmark.png")))
    .resize(INNER.wordmark.w, INNER.wordmark.h, { fit: "fill" })
    .toBuffer();

  const [logoIcon, bookmark, heart] = await Promise.all([
    loadAsset("logo-icon.png",     INNER.logoIcon.w,  INNER.logoIcon.h),
    loadAsset("icon-bookmark.png", INNER.bookmark.w,  INNER.bookmark.h),
    loadAsset("icon-heart.png",    INNER.heart.w,     INNER.heart.h),
  ]);

  // 3. SVG overlay (arrow only — no text on inner slides)
  const svgBuf = Buffer.from(makeInnerSVG(fontDefs));

  // 4. Composite
  await sharp(productBuf)
    .composite([
      { input: svgBuf,           top: 0,                  left: 0                  },
      { input: logoIcon,         top: INNER.logoIcon.y,   left: INNER.logoIcon.x   },
      { input: bookmark,         top: INNER.bookmark.y,   left: INNER.bookmark.x   },
      { input: heart,            top: INNER.heart.y,      left: INNER.heart.x      },
      { input: wordmarkResized,  top: INNER.wordmark.y,   left: INNER.wordmark.x   },
    ])
    .jpeg({ quality: 95 })
    .toFile(outPath);
}
