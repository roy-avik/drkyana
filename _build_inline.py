"""
One-shot build: shrink the hero photo, generate inline SVG QR codes from the
source URLs, and rewrite index.html so it's fully self-contained and small.
"""
import re
import io
import base64
from pathlib import Path

import qrcode
from qrcode.image.svg import SvgPathImage
from PIL import Image

ROOT = Path(__file__).resolve().parent
HTML = ROOT / "index.html"

INSTA_URL = "https://instagram.com/drkyana"
WA_URL = "https://wa.me/8801614369673"

# ---- 1. Shrink + recompress the hero photo --------------------------------
img = Image.open(ROOT / "photo.jpg").convert("RGB")
img.thumbnail((640, 1600), Image.LANCZOS)
buf = io.BytesIO()
img.save(buf, "JPEG", quality=80, optimize=True, progressive=True)
photo_bytes = buf.getvalue()
photo_b64 = base64.b64encode(photo_bytes).decode("ascii")
photo_uri = f"data:image/jpeg;base64,{photo_b64}"
print(f"photo: {img.size}  jpeg={len(photo_bytes)/1024:.0f} KB  b64={len(photo_b64)/1024:.0f} KB")

# ---- 2. Generate clean SVG QR codes ---------------------------------------
def svg_qr(url: str, css_class: str) -> str:
    qr = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(image_factory=SvgPathImage)
    raw = img.to_string(encoding="unicode")
    # strip XML decl + doctype, force responsive sizing
    raw = re.sub(r"<\?xml[^>]*\?>", "", raw)
    raw = re.sub(r"<!DOCTYPE[^>]*>", "", raw)
    raw = re.sub(r'\swidth="[^"]*"', "", raw, count=1)
    raw = re.sub(r'\sheight="[^"]*"', "", raw, count=1)
    raw = raw.replace(
        "<svg ",
        f'<svg class="{css_class}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" ',
        1,
    )
    return raw.strip()

insta_svg = svg_qr(INSTA_URL, "qr-svg")
wa_svg = svg_qr(WA_URL, "qr-svg")
print(f"insta SVG: {len(insta_svg)} chars")
print(f"wa SVG:    {len(wa_svg)} chars")

# ---- 3. Rewrite the HTML ---------------------------------------------------
html = HTML.read_text(encoding="utf-8")

# Replace the giant data URIs with the resized version (matches both the
# img src= and the CSS url(...) — they were both the photo).  We use a
# generic match against any current data URI, but only inside contexts we
# know belong to the photo: the hero <img> and the .hero::after url().

def repl_attr(pattern, new_uri, _html):
    return re.sub(
        pattern,
        lambda m: m.group(1) + new_uri + m.group(2),
        _html,
        count=1,
    )

# Hero <img src="...">  (alt="Dr. Kiana" class="photo-frame")
html = re.sub(
    r'(<img\s+src=")data:image/jpeg;base64,[^"]+("\s+alt="Dr\. Kiana"\s+class="photo-frame")',
    lambda m: m.group(1) + photo_uri + m.group(2),
    html,
)

# CSS url('...') for the hero blur backdrop
html = re.sub(
    r"url\('data:image/jpeg;base64,[^']+'\)",
    f"url('{photo_uri}')",
    html,
)

# Replace QR <img> tags with inline SVG.  Match by their unique alt text.
html = re.sub(
    r'<img\s+src="data:image/jpeg;base64,[^"]+"\s+alt="Instagram QR code for @drkyana"\s*/>',
    insta_svg,
    html,
)
html = re.sub(
    r'<img\s+src="data:image/jpeg;base64,[^"]+"\s+alt="WhatsApp QR code for Dr\. Kiana"\s*/>',
    wa_svg,
    html,
)

# Make sure SVG QRs render at full container size (override the CSS for <img>)
# We add a small style block once.
extra_css = """
  .qr-frame .qr-svg { width: 100%; height: 100%; display: block; }
  .qr-frame .qr-svg path { fill: #0f172a; }
"""
if ".qr-svg" not in html:
    html = html.replace(
        "  /* Reduced motion */",
        extra_css + "\n  /* Reduced motion */",
        1,
    )

HTML.write_text(html, encoding="utf-8", newline="\n")
print(f"\nfinal HTML: {len(html)/1024:.1f} KB")
print(f"contains insta SVG: {('Instagram QR code' not in html) and (insta_svg[:80] in html)}")
print(f"contains wa SVG:    {('WhatsApp QR code' not in html) and (wa_svg[:80] in html)}")
