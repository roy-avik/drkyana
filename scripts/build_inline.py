"""
One-shot build: shrink the hero photo, inline the branded Instagram and
WhatsApp QR exports as base64 PNGs, and rewrite index.html so it's fully
self-contained.

QR workflow: drop the official QR exports into `assets/` as
`insta-qr.png` and `whatsapp-qr.jpg`. The WhatsApp export has a
"Kiana Lotfi / WhatsApp Business Account" caption at the top — we
auto-crop it out and keep just the QR. The IG export is used as-is
(its `@DRKYANA` handle and gradient border are intentional branding).
"""
import re
import io
import base64
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
HTML = ROOT / "index.html"
ASSETS = ROOT / "assets"


def encode_jpeg(im: Image.Image, max_side: int, quality: int) -> tuple[str, int]:
    im = im.convert("RGB")
    im.thumbnail((max_side, max_side * 2), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    data = buf.getvalue()
    return base64.b64encode(data).decode("ascii"), len(data)


def encode_png(im: Image.Image, max_side: int | None) -> tuple[str, int]:
    im = im.convert("RGB")
    if max_side is not None:
        im.thumbnail((max_side, max_side), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    data = buf.getvalue()
    return base64.b64encode(data).decode("ascii"), len(data)


def autocrop_qr(im: Image.Image, top_skip: float = 0.25) -> Image.Image:
    """Drop the top `top_skip` band (caption area), then bbox-trim around
    the dark QR content, then square the result."""
    W, H = im.size
    cropped = im.crop((0, int(H * top_skip), W, H))
    g = np.array(cropped.convert("L"))
    dark = g < 128
    row_has = dark.any(axis=1)
    col_has = dark.any(axis=0)
    if not row_has.any() or not col_has.any():
        return cropped
    top = int(np.argmax(row_has))
    bottom = len(row_has) - int(np.argmax(row_has[::-1]))
    left = int(np.argmax(col_has))
    right = len(col_has) - int(np.argmax(col_has[::-1]))
    side = max(bottom - top, right - left)
    m = side // 18
    cw, ch = cropped.size
    top = max(0, top - m)
    bottom = min(ch, bottom + m)
    left = max(0, left - m)
    right = min(cw, right + m)
    h, w = bottom - top, right - left
    if h > w:
        d = (h - w) // 2
        new_left = max(0, left - d)
        new_right = min(cw, new_left + h)
        new_left = max(0, new_right - h)
        left, right = new_left, new_right
    elif w > h:
        d = (w - h) // 2
        new_top = max(0, top - d)
        new_bottom = min(ch, new_top + w)
        new_top = max(0, new_bottom - w)
        top, bottom = new_top, new_bottom
    return cropped.crop((left, top, right, bottom))


# ---- 1. Shrink + recompress the hero photo --------------------------------
photo_b64, photo_bytes = encode_jpeg(Image.open(ASSETS / "photo.jpg"), 640, 80)
photo_uri = f"data:image/jpeg;base64,{photo_b64}"
print(f"photo: jpeg={photo_bytes/1024:.0f} KB  b64={len(photo_b64)/1024:.0f} KB")

# ---- 2. Inline the branded QR exports as base64 PNGs ----------------------
# IG card is embedded at its full source resolution with no transforms — the
# `@DRKYANA` handle, gradient border, and IG logo render exactly as exported.
# WhatsApp export is auto-cropped to drop the caption band and downsized.
insta_b64, insta_bytes = encode_png(Image.open(ASSETS / "insta-qr.png"), max_side=None)
wa_cropped = autocrop_qr(Image.open(ASSETS / "whatsapp-qr.jpg"))
wa_b64, wa_bytes = encode_png(wa_cropped, 320)
print(f"insta QR:    png={insta_bytes/1024:.0f} KB  b64={len(insta_b64)/1024:.0f} KB  (full {Image.open(ASSETS / 'insta-qr.png').size})")
print(f"whatsapp QR: png={wa_bytes/1024:.0f} KB  b64={len(wa_b64)/1024:.0f} KB  (auto-cropped {wa_cropped.size})")

# ---- 3. Rewrite the HTML ---------------------------------------------------
html = HTML.read_text(encoding="utf-8")

# Hero <img src="...">  (alt="Dr. Kiana" class="photo-frame")
html = re.sub(
    r'(<img\s+src=")data:image/jpeg;base64,[^"]+("\s+alt="Dr\. Kiana"\s+class="photo-frame")',
    lambda m: m.group(1) + photo_uri + m.group(2),
    html,
    count=1,
)

# CSS url('...') for the hero blur backdrop
html = re.sub(
    r"url\('data:image/jpeg;base64,[^']+'\)",
    f"url('{photo_uri}')",
    html,
    count=1,
)

# Replace each QR <img class="qr-photo"> by matching its alt text. The
# wrapper div uses qr-frame--photo, set up once in CSS — we don't touch it.
html = re.sub(
    r'(<img class="qr-photo" src=")data:image/png;base64,[^"]+(" alt="Instagram QR code for @drkyana" />)',
    lambda m: m.group(1) + f"data:image/png;base64,{insta_b64}" + m.group(2),
    html,
    count=1,
)
html = re.sub(
    r'(<img class="qr-photo" src=")data:image/png;base64,[^"]+(" alt="WhatsApp QR code for Dr\. Kiana" />)',
    lambda m: m.group(1) + f"data:image/png;base64,{wa_b64}" + m.group(2),
    html,
    count=1,
)

HTML.write_text(html, encoding="utf-8", newline="\n")
print(f"\nfinal HTML: {len(html)/1024:.1f} KB")
