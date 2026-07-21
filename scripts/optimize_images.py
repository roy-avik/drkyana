#!/usr/bin/env python3
"""
Optimize the source images in ``assets/`` for web delivery and write the
results into ``public/assets/``. React imports them via the public path, so
Vite serves them straight through without re-encoding.

Pipeline
--------
1. ``assets/photo.jpg``         -> ``public/assets/photo.jpg``
   Downsample to 1024 px wide, quality 82 JPEG. The hero element renders this
   at ~480-560 px on most viewports plus a heavy-blurred backdrop; 1024 px
   gives Retina headroom without ballooning the asset.

2. ``assets/insta-qr.png``      -> ``public/assets/insta-qr.png``
   Re-encoded as optimized PNG. We *do not* resize: the Instagram QR card
   includes the ``@DRKYANA`` handle as rendered text, and resampling visibly
   softens it. The source export is typically ~1000x1000 px / ~600 KB; the
   optimizer trims metadata + recompresses but otherwise preserves pixels.

Idempotent — running it again on the same sources produces the same outputs.
Designed to be invoked by humans, agents, or CI:

    python scripts/optimize_images.py           # rebuild everything
    python scripts/optimize_images.py --check   # exit 1 if outputs are stale

Dependencies: ``pip install pillow``.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError as e:
    print(
        f"missing dependency: {e}. install with `pip install pillow`.",
        file=sys.stderr,
    )
    sys.exit(2)

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets"
DST = ROOT / "public" / "assets"

PHOTO_MAX_WIDTH = 1024
PHOTO_QUALITY = 82


# ---------------------------------------------------------------------------
# Pipeline steps
# ---------------------------------------------------------------------------

def optimize_photo(src: Path, dst: Path) -> None:
    img = Image.open(src).convert("RGB")
    if img.width > PHOTO_MAX_WIDTH:
        new_h = int(img.height * PHOTO_MAX_WIDTH / img.width)
        img = img.resize((PHOTO_MAX_WIDTH, new_h), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    img.save(dst, format="JPEG", quality=PHOTO_QUALITY, optimize=True, progressive=True)


def optimize_insta_qr(src: Path, dst: Path) -> None:
    # Preserve pixel dimensions — recompress PNG and strip metadata.
    img = Image.open(src)
    if img.mode not in ("RGB", "RGBA", "P"):
        img = img.convert("RGBA")
    dst.parent.mkdir(parents=True, exist_ok=True)
    img.save(dst, format="PNG", optimize=True)


STEPS = [
    ("photo.jpg", "photo.jpg", optimize_photo),
    ("insta-qr.png", "insta-qr.png", optimize_insta_qr),
]


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def _digest(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def run(check_only: bool = False) -> int:
    if not SRC.exists():
        print(f"missing source dir: {SRC}", file=sys.stderr)
        return 1

    stale: list[str] = []
    for src_name, dst_name, fn in STEPS:
        src = SRC / src_name
        dst = DST / dst_name
        if not src.exists():
            print(f"skip: source not found: {src}", file=sys.stderr)
            continue
        if check_only:
            if not dst.exists():
                stale.append(f"{dst_name}: missing")
                continue
            before = _digest(dst)
            tmp = dst.with_suffix(dst.suffix + ".check")
            fn(src, tmp)
            after = _digest(tmp)
            tmp.unlink(missing_ok=True)
            if before != after:
                stale.append(f"{dst_name}: stale")
            continue
        print(f"  {src_name}  ->  {dst.relative_to(ROOT)}")
        fn(src, dst)

    if check_only:
        if stale:
            print("stale outputs:", file=sys.stderr)
            for s in stale:
                print(f"  {s}", file=sys.stderr)
            print("\nRun `python scripts/optimize_images.py` to refresh.", file=sys.stderr)
            return 1
        print("OK · all optimized assets are up to date")
    else:
        print(f"\nWrote {len(STEPS)} asset(s) to {DST.relative_to(ROOT)}/")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--check", action="store_true", help="Verify outputs are up to date; exit 1 if not.")
    args = p.parse_args(argv)
    return run(check_only=args.check)


if __name__ == "__main__":
    sys.exit(main())
