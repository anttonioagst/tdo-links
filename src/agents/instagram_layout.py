#!/usr/bin/env python3
"""TDO Links — Instagram slide compositor.

Deterministic vector-style overlay applied on top of an AI-generated product
photo. Mirrors the editorial pattern the brand follows:

  - Eye watermark (small) in the upper-right corner of EVERY slide.
  - On the COVER only: a bottom band with the headline, the eye logo at the
    lower-left, and up to three dynamic badges stacked at the lower-right,
    over a dark gradient that guarantees legibility.

Usage:
  python3 instagram_layout.py <spec.json>

spec.json:
  {
    "base":      "/path/product.png",   # AI product photo (any size)
    "out":       "/path/slide-01.png",
    "logo":      "/path/tdo-eye-white.png",
    "mode":      "cover" | "slide",
    "headline":  ["LINHA 1", "LINHA 2"],  # cover only
    "badges":    ["50% OFF", "EM PROMOÇÃO", "LINK NA BIO"],  # cover only
    "textColor": "light" | "dark"          # adapts to bg luminance
  }
"""
import json
import sys
from PIL import Image, ImageDraw, ImageFont

# --- canvas -----------------------------------------------------------------
W, H = 1080, 1440  # 3:4 portrait feed
MARGIN = 64
ACCENT = (236, 98, 39)  # #EC6227 TDO orange

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"


def load_font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


def fit_base(path):
    """Cover-crop the product photo into the 3:4 canvas."""
    img = Image.open(path).convert("RGBA")
    scale = max(W / img.width, H / img.height)
    img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    left = (img.width - W) // 2
    top = (img.height - H) // 2
    return img.crop((left, top, left + W, top + H))


def paste_logo(base, logo_path, box_w, x, y):
    logo = Image.open(logo_path).convert("RGBA")
    bbox = logo.split()[3].getbbox()
    if bbox:
        logo = logo.crop(bbox)
    h = round(logo.height * (box_w / logo.width))
    logo = logo.resize((box_w, h), Image.LANCZOS)
    base.alpha_composite(logo, (x, y))
    return box_w, h


def bottom_gradient(base):
    """Dark gradient on the lower portion for text legibility."""
    grad = Image.new("L", (1, H), 0)
    start = int(H * 0.48)
    for y in range(start, H):
        t = (y - start) / (H - start)
        grad.putpixel((0, y), int(225 * (t ** 1.4)))
    alpha = grad.resize((W, H))
    black = Image.new("RGBA", (W, H), (8, 8, 10, 0))
    black.putalpha(alpha)
    base.alpha_composite(black)


def wrap(draw, text, font, max_w):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=font) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def render(spec):
    base = fit_base(spec["base"])
    draw = ImageDraw.Draw(base)
    is_dark = spec.get("textColor", "light") != "dark"
    fg = (255, 255, 255) if is_dark else (20, 20, 22)
    logo_path = spec["logo"]

    if spec.get("mode") == "cover":
        bottom_gradient(base)
        draw = ImageDraw.Draw(base)

        # --- dynamic badges, lower-right, stacked, bottom-aligned ----------
        badges = [b for b in spec.get("badges", []) if b][:3]
        badge_font = load_font(FONT_MONO, 26)
        line_h = 40
        block_h = line_h * len(badges)
        by = H - MARGIN - block_h
        for i, b in enumerate(badges):
            label = b.upper()
            tw = draw.textlength(label, font=badge_font)
            color = ACCENT if i == 0 else (fg + ())
            draw.text((W - MARGIN - tw, by + i * line_h), label, font=badge_font,
                      fill=(color if i == 0 else (fg[0], fg[1], fg[2], 230)))

        # --- eye logo, lower-left -----------------------------------------
        logo_w = 150
        _, logo_h = paste_logo(base, logo_path, logo_w, MARGIN, H - MARGIN - 96)
        draw = ImageDraw.Draw(base)

        # --- headline, above the badge/logo row ---------------------------
        lines = spec.get("headline", [])
        if isinstance(lines, str):
            lines = [lines]
        head_font = load_font(FONT_BOLD, 62)
        # wrap each provided line to canvas width
        wrapped = []
        max_w = W - 2 * MARGIN
        for ln in lines:
            wrapped.extend(wrap(draw, ln.upper(), head_font, max_w))
        wrapped = wrapped[:4]
        head_lh = 70
        bottom_anchor = H - MARGIN - 96 - 36  # just above logo row
        ty = bottom_anchor - head_lh * len(wrapped)
        # thin accent bar above headline
        draw.rectangle([MARGIN, ty - 26, MARGIN + 70, ty - 20], fill=ACCENT)
        for i, ln in enumerate(wrapped):
            draw.text((MARGIN, ty + i * head_lh), ln, font=head_font, fill=fg)

    # --- watermark eye, upper-right, EVERY slide --------------------------
    wm_w = max(72, round(W * 0.085))
    paste_logo(base, logo_path, wm_w, W - wm_w - 40, 40)

    base.convert("RGB").save(spec["out"], quality=95)
    print("layout_ok", spec["out"])


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as fh:
        render(json.load(fh))
