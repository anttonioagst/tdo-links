import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(__dirname, "..", "public", "brand-assets");

// ─── Brand tokens ────────────────────────────────────────────────────────────
const W = 1080, H = 1440;
const BG = "#171717";
const ORANGE = "#EC6227";
const PANEL = "#E5E5E5";
const SUBTITLE = "#3A3A3A";
const PILL_BG = "#C6C6C6";
const PILL_TX = "#7A7A7A";
const DIVIDER = "#C6C6C6";
const HN = "'Helvetica Neue', 'Inter', Arial, sans-serif";

function esc(s = "") {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function asset(name, w, h) {
  return sharp(await readFile(join(ASSETS, name))).resize(w, h, { fit: "fill" }).toBuffer();
}

// ═══════════════════════════════════════════════════════════════════════════
// CAPA (node 34:3) — fullbleed product photo + orange footer, white product name
// ═══════════════════════════════════════════════════════════════════════════
export async function composeCapa(imagePath, { productLine, brandName, outPath }) {
  const canvas = await sharp(imagePath).resize(W, H, { fit: "cover", position: "center" }).png().toBuffer();

  // Bottom gradient for footer legibility over any photo
  const grad = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BG}" stop-opacity="0"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0.85"/>
    </linearGradient></defs>
    <rect x="0" y="900" width="${W}" height="${H - 900}" fill="url(#g)"/></svg>`);

  // Product name — Helvetica Neue Medium 80px white, auto-fit, 2 lines, x=385
  const px = 385, availW = W - px - 30;
  const longest = Math.max(productLine.length, brandName.length);
  const fit = Math.floor(availW / (longest * 0.56));
  const fs = Math.max(40, Math.min(80, fit));
  const lh = Math.round(fs * 1.12);
  const l2y = 1170, l1y = l2y - lh;

  const text = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <text x="${px}" y="${l1y}" font-family="${HN}" font-weight="500" font-size="${fs}" fill="white">${esc(productLine)}</text>
    <text x="${px}" y="${l2y}" font-family="${HN}" font-weight="500" font-size="${fs}" fill="white">${esc(brandName)}</text>
    <!-- taglines: Helvetica Neue Light 16px orange 60% -->
    <g fill="${ORANGE}" fill-opacity="0.6" font-family="${HN}" font-weight="300" font-size="16" letter-spacing="0.5">
      <text x="37" y="1170">NÃO SOMOS</text>
      <text x="37" y="1189">UMA LOJA</text>
      <text x="37" y="1256">DESCONTOS</text>
      <text x="37" y="1275">EXCLUSIVOS</text>
    </g></svg>`);

  const [wordmark, bookmark, heart] = await Promise.all([
    asset("logo-wordmark-orange.png", 190, 54),
    asset("icon-bookmark-orange.png", 20, 30),
    asset("icon-heart-orange.png", 34, 30),
  ]);

  await sharp(canvas).composite([
    { input: grad, top: 0, left: 0 },
    { input: text, top: 0, left: 0 },
    { input: wordmark, top: 1022, left: 37 },
    { input: bookmark, top: 1328, left: 37 },
    { input: heart, top: 1328, left: 80 },
  ]).jpeg({ quality: 95 }).toFile(outPath);
}

// ═══════════════════════════════════════════════════════════════════════════
// CARROSSEL 1 (node 23:2) — fullbleed photo + gray UI (internal product slide)
// ═══════════════════════════════════════════════════════════════════════════
export async function composeCarrossel1(imagePath, { outPath }) {
  const canvas = await sharp(imagePath).resize(W, H, { fit: "cover", position: "center" }).png().toBuffer();

  // subtle gradients top & bottom for icon legibility
  const grad = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BG}" stop-opacity="0.55"/><stop offset="1" stop-color="${BG}" stop-opacity="0"/></linearGradient>
    <linearGradient id="b" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BG}" stop-opacity="0"/><stop offset="1" stop-color="${BG}" stop-opacity="0.7"/></linearGradient></defs>
    <rect x="0" y="0" width="${W}" height="200" fill="url(#t)"/>
    <rect x="0" y="1240" width="${W}" height="200" fill="url(#b)"/></svg>`);

  // arrow (gray) bottom-right: x=819 y=1351 w=160 h=14
  const ay = 1358, ax1 = 819, ax2 = 819 + 160;
  const arrow = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <line x1="${ax1}" y1="${ay}" x2="${ax2 - 10}" y2="${ay}" stroke="#B3B3B3" stroke-width="2"/>
    <polyline points="${ax2 - 12},${ay - 7} ${ax2},${ay} ${ax2 - 12},${ay + 7}" fill="none" stroke="#B3B3B3" stroke-width="2"/></svg>`);

  const [eye, wordmark, bookmark, heart] = await Promise.all([
    asset("logo-icon-gray.png", 68, 54),
    asset("logo-wordmark-gray.png", 105, 30),
    asset("icon-bookmark-gray.png", 20, 30),
    asset("icon-heart-gray.png", 34, 30),
  ]);

  await sharp(canvas).composite([
    { input: grad, top: 0, left: 0 },
    { input: eye, top: 47, left: 36 },
    { input: bookmark, top: 1358, left: 37 },
    { input: heart, top: 1358, left: 80 },
    { input: wordmark, top: 1358, left: 181 },
    { input: arrow, top: 0, left: 0 },
  ]).jpeg({ quality: 95 }).toFile(outPath);
}

// ═══════════════════════════════════════════════════════════════════════════
// CARROSSEL 2 (node 34:43) — image top (601px) + light info panel + community CTA
// ═══════════════════════════════════════════════════════════════════════════
export async function composeCarrossel2(imagePath, { title, subtitle, outPath }) {
  // base: dark canvas, image in top region 0..601, panel below
  const imgTop = await sharp(imagePath).resize(W, 601, { fit: "cover", position: "center" }).toBuffer();
  const base = await sharp({ create: { width: W, height: H, channels: 4, background: BG } })
    .composite([
      { input: imgTop, top: 0, left: 0 },
      { input: { create: { width: W, height: H - 601, channels: 4, background: PANEL } }, top: 601, left: 0 },
    ]).png().toBuffer();

  // wrap helper
  const wrap = (str, max) => {
    const words = str.split(" "); const lines = []; let cur = "";
    for (const w of words) { if ((cur + " " + w).trim().length > max) { lines.push(cur.trim()); cur = w; } else cur += " " + w; }
    if (cur.trim()) lines.push(cur.trim());
    return lines;
  };
  // wrap into AT MOST `maxLines` balanced lines (overflow folds into last line)
  const wrapMax = (str, perLine, maxLines) => {
    let lines = wrap(str, perLine);
    if (lines.length > maxLines) {
      const head = lines.slice(0, maxLines - 1);
      const tail = lines.slice(maxLines - 1).join(" ");
      lines = [...head, tail];
    }
    return lines;
  };

  // TITLE — max 2 lines, auto-fit font so longest line fits in 746px (left col)
  const titleLines = wrapMax(title, 14, 2);
  const tMaxChars = Math.max(...titleLines.map(l => l.length));
  const titleFs = Math.max(44, Math.min(70, Math.floor(746 / (tMaxChars * 0.56))));
  const titleLH = Math.round(titleFs * 1.14);
  let tSvg = "";
  titleLines.forEach((ln, i) => { tSvg += `<text x="70" y="${714 + i * titleLH}" font-family="${HN}" font-weight="500" font-size="${titleFs}" fill="${ORANGE}">${esc(ln)}</text>`; });

  // SUBTITLE — fixed at y=900, up to 3 lines. Truncate (…) instead of overflowing.
  const subAll = wrap(subtitle, 30);
  const subLines = subAll.slice(0, 3);
  if (subAll.length > 3) subLines[2] = subLines[2].replace(/[.,;:]?\s*$/, "") + "…";
  let sSvg = "";
  subLines.forEach((ln, i) => { sSvg += `<text x="70" y="${900 + i * 50}" font-family="${HN}" font-weight="500" font-size="40" fill="${SUBTITLE}">${esc(ln)}</text>`; });

  // arrow orange bottom-left x=70 y=1349 w=160
  const ay = 1356, ax1 = 70, ax2 = 70 + 160;
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${tSvg}${sSvg}
    <!-- dividers -->
    <rect x="888" y="607" width="4" height="400" fill="${DIVIDER}"/>
    <rect x="888" y="1040" width="4" height="380" fill="${DIVIDER}"/>
    <rect x="68" y="1021" width="803" height="4" fill="${DIVIDER}"/>
    <rect x="916" y="1021" width="164" height="4" fill="${DIVIDER}"/>
    <!-- arrow -->
    <line x1="${ax1}" y1="${ay}" x2="${ax2 - 10}" y2="${ay}" stroke="${ORANGE}" stroke-width="3"/>
    <polyline points="${ax2 - 13},${ay - 8} ${ax2},${ay} ${ax2 - 13},${ay + 8}" fill="none" stroke="${ORANGE}" stroke-width="3"/></svg>`);

  // pills (gray bg + gray text) — fixed copy
  const pill = async (text, w, h) => {
    const lines = wrap(text, 16);
    let t = "";
    const startY = h / 2 - (lines.length - 1) * 24 + 14;
    lines.forEach((ln, i) => { t += `<text x="20" y="${startY + i * 46}" font-family="${HN}" font-weight="500" font-size="40" fill="${PILL_TX}">${esc(ln)}</text>`; });
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${PILL_BG}"/>${t}</svg>`);
  };
  const pill1 = await pill("Garanta já com desconto!", 344, 101);
  const pill2 = await pill("Faça parte da comunidade TDO.", 344, 112);

  const [wordmark, bookmark, heart] = await Promise.all([
    asset("logo-wordmark-gray.png", 105, 30),
    asset("icon-bookmark-orange.png", 20, 30),
    asset("icon-heart-orange.png", 34, 30),
  ]);

  await sharp(base).composite([
    { input: wordmark, top: 500, left: 70 },     // gray TBO on image
    { input: overlay, top: 0, left: 0 },
    { input: pill1, top: 1026, left: 68 },
    { input: pill2, top: 1165, left: 70 },
    { input: heart, top: 1051, left: 925 },
    { input: bookmark, top: 1051, left: 978 },
  ]).jpeg({ quality: 95 }).toFile(outPath);
}

// ═══════════════════════════════════════════════════════════════════════════
// STORY (node 36:71) — base PNG template, 5 deal cards + correct % tags
// cards: [big, TL, TR, BL, BR], each = { imagePath, discount } (discount = number)
// ═══════════════════════════════════════════════════════════════════════════
const STORY_TEMPLATE = join(__dirname, "..", "..", "Instagram", "Story", "Story1.png");
const SW = 1200, SH = 2134;
const TAG_YELLOW = "#EAFAA9";

// Card image rects (Figma 1x ×2) — [left, top, width, height]
// tag = { tcx, tcy } text center of the old "50% OFF" (from pixel scan), patch covers + rewrites it
const STORY_CARDS = {
  big: { rect: [152, 433, 887, 667], logo: [794, 438, 196, 64],  tag: { tcx: 955, tcy: 989,  pw: 264, ph: 182, fs: 66, rot: -8, lines: 2 } },
  tl:  { rect: [72, 1209, 478, 385],  logo: [436, 1232, 94, 28],  tag: { tcx: 160, tcy: 1582, pw: 244, ph: 56,  fs: 34, rot: -6, lines: 1 } },
  tr:  { rect: [648, 1208, 478, 385],  logo: [1008, 1230, 94, 28], tag: { tcx: 726, tcy: 1580, pw: 244, ph: 56,  fs: 34, rot: -6, lines: 1 } },
  bl:  { rect: [72, 1686, 478, 385],   logo: [436, 1710, 94, 28],  tag: { tcx: 160, tcy: 2074, pw: 244, ph: 56,  fs: 34, rot: -6, lines: 1 } },
  br:  { rect: [648, 1685, 478, 385],  logo: [1008, 1710, 94, 28], tag: { tcx: 726, tcy: 2070, pw: 244, ph: 56,  fs: 34, rot: -6, lines: 1 } },
};

export async function composeStory(cards, { outPath }) {
  const order = ["big", "tl", "tr", "bl", "br"];
  const layers = [];

  // 1. Card images (cover-fit into each rect)
  for (let i = 0; i < order.length; i++) {
    const key = order[i];
    const card = cards[i];
    if (!card?.imagePath) continue;
    const [l, t, w, h] = STORY_CARDS[key].rect;
    const img = await sharp(card.imagePath).resize(w, h, { fit: "cover", position: "center" }).toBuffer();
    layers.push({ input: img, top: t, left: l });
  }

  // 2. Re-overlay gray TBO wordmark on each card (sits above the pasted image)
  for (let i = 0; i < order.length; i++) {
    const key = order[i];
    if (!cards[i]?.imagePath) continue;
    const [lx, ly, lw, lh] = STORY_CARDS[key].logo;
    const wm = await asset("logo-wordmark-gray.png", lw, lh);
    layers.push({ input: wm, top: ly, left: lx });
  }

  // 3. Discount tags — cover old "50% OFF" text with a yellow patch + write correct %
  for (let i = 0; i < order.length; i++) {
    const key = order[i];
    const card = cards[i];
    if (card?.discount == null) continue;
    const { tcx, tcy, pw, ph, fs, rot, lines } = STORY_CARDS[key].tag;
    const cxp = pw / 2, cyp = ph / 2;
    const txt = lines === 2
      ? `<text x="${cxp}" y="${cyp - fs * 0.55}" text-anchor="middle" dominant-baseline="central" font-family="${HN}" font-weight="700" font-size="${fs}" fill="#171717">${card.discount}%</text>
         <text x="${cxp}" y="${cyp + fs * 0.55}" text-anchor="middle" dominant-baseline="central" font-family="${HN}" font-weight="700" font-size="${fs}" fill="#171717">OFF</text>`
      : `<text x="${cxp}" y="${cyp}" text-anchor="middle" dominant-baseline="central" font-family="${HN}" font-weight="700" font-size="${fs}" fill="#171717">${card.discount}% OFF</text>`;
    const tag = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}">
      <g transform="rotate(${rot} ${cxp} ${cyp})">
        <rect x="0" y="0" width="${pw}" height="${ph}" fill="${TAG_YELLOW}"/>
        ${txt}
      </g></svg>`);
    layers.push({ input: tag, top: Math.round(tcy - ph / 2), left: Math.round(tcx - pw / 2) });
  }

  await sharp(STORY_TEMPLATE).resize(SW, SH).composite(layers).jpeg({ quality: 95 }).toFile(outPath);
}
