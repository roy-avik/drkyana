#!/usr/bin/env python3
"""
Rasterize ``public/tooth.svg`` into the PNG icons the PWA manifest needs.

The manifest in ``vite.config.ts`` references three icons under
``public/icons/``:

  quick-check-192.png        192x192, regular tooth on brand background
  quick-check-512.png        512x512, regular tooth on brand background
  quick-check-maskable.png   512x512, brand background full-bleed,
                             tooth shrunk into the inner ~80% safe zone

Maskable icons let Chrome / Android crop the icon into circle / squircle /
square home-screen shapes without clipping the tooth. The safe-zone padding
keeps the artwork inside whatever shape the launcher applies.

Dependencies:  pip install cairosvg pillow

Idempotent — running it again on the same source produces the same output.
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

try:
    import cairosvg
    from PIL import Image
except ImportError as e:
    print(f"missing dependency: {e}. install with `pip install cairosvg pillow`.", file=sys.stderr)
    sys.exit(2)

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "tooth.svg"
DST_DIR = ROOT / "public" / "icons"

BRAND = (15, 76, 129, 255)  # #0f4c81


def _rasterize_svg(svg_path: Path, size: int) -> Image.Image:
    png_bytes = cairosvg.svg2png(url=str(svg_path), output_width=size, output_height=size)
    return Image.open(io.BytesIO(png_bytes)).convert("RGBA")


def _composite_on_brand(tooth: Image.Image, size: int, tooth_scale: float) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), BRAND)
    inner = int(size * tooth_scale)
    fg = tooth.resize((inner, inner), Image.LANCZOS)
    # Recolor the tooth black-on-transparent SVG into white so it pops on brand.
    pixels = fg.load()
    for y in range(fg.height):
        for x in range(fg.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            # Existing fills are #000 (tooth outline) and #fff (tooth highlights).
            # Invert: everything visible becomes white, preserving alpha.
            pixels[x, y] = (255, 255, 255, a)
    offset = (size - inner) // 2
    canvas.alpha_composite(fg, dest=(offset, offset))
    return canvas


def main() -> int:
    if not SRC.exists():
        print(f"missing source: {SRC}", file=sys.stderr)
        return 1
    DST_DIR.mkdir(parents=True, exist_ok=True)

    targets = [
        ("quick-check-192.png", 192, 0.78),
        ("quick-check-512.png", 512, 0.78),
        ("quick-check-maskable.png", 512, 0.62),  # smaller safe zone for maskable
    ]

    for name, size, scale in targets:
        tooth = _rasterize_svg(SRC, size)
        icon = _composite_on_brand(tooth, size, scale)
        out = DST_DIR / name
        icon.save(out, format="PNG", optimize=True)
        print(f"  {name}  {size}x{size}")

    print(f"\nWrote {len(targets)} icon(s) to {DST_DIR.relative_to(ROOT)}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
