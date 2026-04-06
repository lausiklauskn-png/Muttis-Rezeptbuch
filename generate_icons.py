#!/usr/bin/env python3
"""
generate_icons.py
=================
Converts icons/icon-book.svg to PNG files in all sizes required by the
PWA manifest.  Two backends are supported (tried in order):

  1. cairosvg  – pip install cairosvg
  2. Pillow + cairosvg  – same package, just uses Pillow for post-processing

Run:
    python generate_icons.py

Output files are written to  icons/icon-book-{size}.png
"""

import os
import sys

# ── Configuration ─────────────────────────────────────────────────────────────

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ICONS_DIR  = os.path.join(SCRIPT_DIR, "icons")
SVG_SOURCE = os.path.join(ICONS_DIR, "icon-book.svg")

# All sizes required by the manifest
SIZES = [72, 96, 128, 144, 152, 192, 384, 512]


# ── Helpers ───────────────────────────────────────────────────────────────────

def convert_with_cairosvg(sizes):
    """Use cairosvg to render SVG → PNG at each requested size."""
    import cairosvg  # type: ignore

    for size in sizes:
        out_path = os.path.join(ICONS_DIR, f"icon-book-{size}.png")
        cairosvg.svg2png(
            url=SVG_SOURCE,
            write_to=out_path,
            output_width=size,
            output_height=size,
        )
        print(f"  [OK] {out_path}  ({size}×{size})")


def convert_with_pillow(sizes):
    """
    Fallback: render via cairosvg to an in-memory PNG, then use Pillow to
    resize/save (gives more control over palette / optimisation).
    """
    import cairosvg          # type: ignore
    from PIL import Image    # type: ignore
    import io

    # Render at maximum size once to keep quality high when downscaling.
    max_size = max(sizes)
    raw_png = cairosvg.svg2png(
        url=SVG_SOURCE,
        output_width=max_size,
        output_height=max_size,
    )

    for size in sizes:
        img = Image.open(io.BytesIO(raw_png)).convert("RGBA")
        if size != max_size:
            img = img.resize((size, size), Image.LANCZOS)
        out_path = os.path.join(ICONS_DIR, f"icon-book-{size}.png")
        img.save(out_path, "PNG", optimize=True)
        print(f"  [OK] {out_path}  ({size}×{size})")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if not os.path.isfile(SVG_SOURCE):
        print(f"ERROR: SVG source not found: {SVG_SOURCE}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(ICONS_DIR, exist_ok=True)

    print(f"Source SVG : {SVG_SOURCE}")
    print(f"Output dir : {ICONS_DIR}")
    print(f"Sizes      : {SIZES}\n")

    # Try cairosvg (preferred)
    try:
        import cairosvg  # noqa: F401 – just testing importability
        print("Backend: cairosvg")
        try:
            from PIL import Image  # noqa: F401
            convert_with_pillow(SIZES)
        except ImportError:
            convert_with_cairosvg(SIZES)
    except ImportError:
        print(
            "ERROR: cairosvg is not installed.\n"
            "       Install it with:  pip install cairosvg\n"
            "       (Pillow is optional but recommended: pip install Pillow)",
            file=sys.stderr,
        )
        print(
            "\nNOTE: The manifest currently references SVG icons directly.\n"
            "      PNG conversion is only needed for browsers that do not\n"
            "      support SVG in Web App Manifests (e.g. older Chrome on Android).",
        )
        sys.exit(1)

    print("\nDone. All PNG icons generated successfully.")
    print(
        "\nNOTE: Remember to update manifest.json if you switch from SVG to PNG icons."
    )


if __name__ == "__main__":
    main()
