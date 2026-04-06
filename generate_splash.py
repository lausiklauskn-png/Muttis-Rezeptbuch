#!/usr/bin/env python3
"""
generate_splash.py
==================
Generates Apple iOS splash screens and missing icon sizes for App Store submission.

Run:
    python generate_splash.py

Output:
    icons/icon-book-{size}.png   – additional icon sizes (120, 180px)
    icons/splash-{w}x{h}.png     – splash screens for common iPhone/iPad sizes
"""

import os
import io
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ICONS_DIR  = os.path.join(SCRIPT_DIR, "icons")
SVG_SOURCE = os.path.join(ICONS_DIR, "icon-book.svg")

# Background color matching --sand CSS variable
BG_COLOR = (249, 244, 236)   # #f9f4ec
ICON_COLOR = (122, 88, 64)   # #7a5840 (used for icon tinting if needed)

# iPhone/iPad splash screen sizes (portrait, device resolution)
SPLASH_SIZES = [
    (640,  1136, "iPhone SE 1st gen"),
    (750,  1334, "iPhone 6/7/8"),
    (828,  1792, "iPhone XR / 11"),
    (1125, 2436, "iPhone X / XS / 11 Pro"),
    (1170, 2532, "iPhone 12 / 13 / 14"),
    (1179, 2556, "iPhone 14 Pro / 15 / 15 Pro"),
    (1242, 2208, "iPhone 6+ / 7+ / 8+"),
    (1242, 2688, "iPhone XS Max / 11 Pro Max"),
    (1284, 2778, "iPhone 12/13/14 Pro Max"),
    (1290, 2796, "iPhone 14 Pro Max / 15 Pro Max"),
    (1536, 2048, "iPad mini / Air (portrait)"),
    (2048, 2732, "iPad Pro 12.9\" (portrait)"),
]

# Additional icon sizes needed for iOS
EXTRA_ICON_SIZES = [120, 180]


def main():
    try:
        import cairosvg
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("ERROR: cairosvg and Pillow are required.\n"
              "       pip install cairosvg Pillow", file=sys.stderr)
        sys.exit(1)

    os.makedirs(ICONS_DIR, exist_ok=True)

    # ── Generate missing icon sizes ──────────────────────────────────────────
    print("Generating additional icon sizes...")
    for size in EXTRA_ICON_SIZES:
        out = os.path.join(ICONS_DIR, f"icon-book-{size}.png")
        if not os.path.exists(out):
            raw = cairosvg.svg2png(url=SVG_SOURCE, output_width=size, output_height=size)
            with open(out, "wb") as f:
                f.write(raw)
            print(f"  [OK] icon-book-{size}.png  ({size}×{size})")
        else:
            print(f"  [--] icon-book-{size}.png already exists, skipping")

    # ── Load icon for splash screens ─────────────────────────────────────────
    icon_size = 192
    icon_raw = cairosvg.svg2png(url=SVG_SOURCE, output_width=icon_size, output_height=icon_size)
    icon_img = Image.open(io.BytesIO(icon_raw)).convert("RGBA")

    # ── Generate splash screens ───────────────────────────────────────────────
    print("\nGenerating Apple splash screens...")
    for (w, h, label) in SPLASH_SIZES:
        out = os.path.join(ICONS_DIR, f"splash-{w}x{h}.png")
        splash = Image.new("RGBA", (w, h), BG_COLOR + (255,))

        # Center the icon
        ix = (w - icon_size) // 2
        iy = (h - icon_size) // 2 - 40  # slightly above center

        splash.paste(icon_img, (ix, iy), icon_img)

        # Save as RGB PNG (no alpha needed for splash)
        splash.convert("RGB").save(out, "PNG", optimize=True)
        print(f"  [OK] splash-{w}x{h}.png  ({label})")

    print("\nDone.")
    print("\nNext step: add <link rel='apple-touch-startup-image'> tags to index.html")
    print("(already handled by generate_splash.py companion edit)")


if __name__ == "__main__":
    main()
