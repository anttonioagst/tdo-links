#!/usr/bin/env python3
"""TDO Links — Instagram slide compositor.

Layout mirrors the editorial style from the reference:
  - Top bar: two small metadata labels on the left + small eye watermark top-right
  - Bottom footer row (space-between, vertically centered):
      LEFT  → eye logo mark
      CENTER → bold headline
      RIGHT  → 3 small stacked labels (dynamic per offer)
  - Slides 2/3: only the top-right watermark, no bottom elements.

Usage:
  python3 instagram_layout.py <spec.json>

spec.json fields:
  base        path to AI product photo
  out         output path
  logo        path to tdo-eye-white.png
  mode        "cover" | "slide"
  headline    string or list[str] — cover only
  labels      list[str] (3 items) — cover only, dynamic per offer
  textColor   "light" (default) | "dark"
"""

import json
import sys
import textwrap
from PIL import Image, ImageDraw, ImageFont

# ── canvas ──────────────────────────────────────────────────────────────────
W, H = 1080, 1440  # 3:4 portrait

ORANGE = (236, 98, 39)

# Inter variable font — clean humanist sans matching the reference aesthetic
FONT_PATH  = "/tmp/fonts/InterVariable.ttf"
FONT_BOLD  = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
FONT_REG   = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"


def font(size, bold=False):
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except Exception:
        path = FONT_BOLD if bold else FONT_REG
        return ImageFont.truetype(path, size)


# ── helpers ──────────────────────────────────────────────────────────────────

def fit_crop(path, w=W, h=H):
    img = Image.open(path).convert("RGBA")
    scale = max(w / img.width, h / img.height)
    img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    ox, oy = (img.width - w) // 2, (img.height - h) // 2
    return img.crop((ox, oy, ox + w, oy + h))


def load_logo(path, target_w):
    logo = Image.open(path).convert("RGBA")
    bb = logo.split()[3].getbbox()
    if bb:
        logo = logo.crop(bb)
    scale = target_w / logo.width
    return logo.resize((target_w, round(logo.height * scale)), Image.LANCZOS)


def dark_gradient(base, start_y_frac=0.50, max_alpha=220):
    """Vertical dark gradient from start_y_frac to bottom."""
    ow, oh = base.size
    start = int(oh * start_y_frac)
    overlay = Image.new("RGBA", (ow, oh), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    for y in range(start, oh):
        t = (y - start) / (oh - start)
        a = int(max_alpha * (t ** 1.2))
        d.line([(0, y), (ow, y)], fill=(8, 8, 10, a))
    base.alpha_composite(overlay)


def text_lines(draw, text, f, max_w):
    """Wrap text to fit max_w, return list of lines."""
    words = text.split()
    lines, cur = [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=f) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


# ── main ─────────────────────────────────────────────────────────────────────

def render(spec):
    base   = fit_crop(spec["base"])
    logo_path = spec["logo"]
    is_dark   = spec.get("textColor", "light") != "dark"
    fg        = (255, 255, 255) if is_dark else (18, 18, 18)
    fg_dim    = fg + (160,) if len(fg) == 3 else fg  # semi-transparent

    PAD = 56  # outer padding

    if spec.get("mode") == "cover":
        dark_gradient(base, start_y_frac=0.44, max_alpha=210)

    draw = ImageDraw.Draw(base)

    # ── TOP BAR ─────────────────────────────────────────────────────────────
    # Two small metadata labels, left-aligned, top
    meta_font = font(22)
    meta_y = PAD
    meta_line_h = 28
    meta = spec.get("meta", ["@tdolinks", "2026"])
    for i, m in enumerate(meta[:2]):
        draw.text((PAD, meta_y + i * meta_line_h), m.upper(), font=meta_font,
                  fill=(fg[0], fg[1], fg[2], 140))

    # Watermark: eye logo, upper-right, small — EVERY slide
    wm_w = round(W * 0.082)   # ~89 px
    wm = load_logo(logo_path, wm_w)
    wm_x = W - wm_w - PAD
    wm_y = PAD
    # tint white logo to fg color
    base.alpha_composite(wm, (wm_x, wm_y))

    # ── BOTTOM FOOTER (cover only) ───────────────────────────────────────────
    if spec.get("mode") == "cover":
        PAD_BOT = 72          # bottom margin
        LOGO_W  = 100         # logo mark width (left column)
        LBL_W   = 200         # reserved width for right-column labels

        labels = [l for l in spec.get("labels", []) if l][:3]
        headline_raw = spec.get("headline", "")
        if isinstance(headline_raw, list):
            headline_raw = " ".join(headline_raw)

        # --- RIGHT: measure labels first so we know available headline width ---
        lbl_font   = font(20)           # thinner / smaller
        lbl_line_h = 46                 # gap between labels
        lbl_block_h = lbl_line_h * len(labels) if labels else 0
        max_lbl_w = max((draw.textlength(l.upper(), font=lbl_font) for l in labels), default=0)
        LBL_W = int(max_lbl_w) + 16

        # --- CENTER: compute headline block ---
        logo_right = PAD + LOGO_W + 56   # breathing room between logo and headline
        lbl_left   = W - PAD - LBL_W - 20
        avail_w    = lbl_left - logo_right - 24

        head_size = 62
        head_font = font(head_size)
        lines = text_lines(draw, headline_raw, head_font, avail_w)
        while len(lines) > 4 and head_size > 38:
            head_size -= 4
            head_font = font(head_size)
            lines = text_lines(draw, headline_raw, head_font, avail_w)
        lines = lines[:4]
        lh = int(head_size * 1.20)
        head_block_h = lh * len(lines)

        # --- LEFT: logo dimensions ---
        logo_img  = load_logo(logo_path, LOGO_W)
        logo_h    = logo_img.height

        # row height = tallest element
        row_h = max(logo_h, lbl_block_h, head_block_h)

        # bottom-anchor the row: bottom edge at H - PAD_BOT
        row_top = H - PAD_BOT - row_h

        # paste logo — vertically centered in row
        lx = PAD
        ly = row_top + (row_h - logo_h) // 2
        base.alpha_composite(logo_img, (lx, ly))

        # draw labels — vertically centered in row, right-aligned
        l_y0 = row_top + (row_h - lbl_block_h) // 2
        for i, lbl in enumerate(labels):
            lw = draw.textlength(lbl.upper(), font=lbl_font)
            lx2 = W - PAD - int(lw)
            color = ORANGE if i == 0 else (fg[0], fg[1], fg[2], 200)
            draw.text((lx2, l_y0 + i * lbl_line_h), lbl.upper(), font=lbl_font, fill=color)

        # draw headline — vertically centered in row
        hy = row_top + (row_h - head_block_h) // 2
        for i, ln in enumerate(lines):
            draw.text((logo_right, hy + i * lh), ln, font=head_font, fill=fg)

    base.convert("RGB").save(spec["out"], quality=95)
    print("layout_ok", spec["out"])


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as fh:
        render(json.load(fh))
