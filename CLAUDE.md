# Dr. Kiana — Portfolio Site

Single-page promotional site for Dr. Kiana, a dental surgeon consulting at chambers across Dhaka on a freelance basis (no single fixed clinic — appointment locations are confirmed per patient). Lives on her Instagram bio and (eventually) a business card. Patient management is **explicitly out of scope** — that's handled separately via AppSheet / Google Forms.

Brand voice: calm, considered, modern. Site tagline is **"Modern dentistry. Considered care."** Don't reintroduce "fresh graduate" framing — it was deliberately removed to project a more established, professional brand.

## What this is

One self-contained `index.html` (~340 KB). Everything inline: CSS, JS, the hero photo as a base64 JPEG data URI, both QR codes as base64 PNG data URIs. No external assets required to render. No frameworks, no build step in the deployment path.

## Architecture

- **Hosting:** GitHub Pages on this repo's `main` branch, root path. URL: `https://roy-avik.github.io/drkyana/`.
- **Source of truth:** `index.html`. Edit it directly for any copy/style change, commit, push — Pages re-publishes within ~30 seconds.
- **Photo:** embedded as base64 JPEG inside `index.html`. Original lives in the repo root as `photo.jpg`.
- **QR codes:** the branded exports from each app — Instagram's gradient/`@DRKYANA` card and WhatsApp's labelled QR — saved in the repo as `insta-qr.jpg` and `whatsapp-qr.jpg`, then resized to ~320px and inlined as base64 PNGs by `_build_inline.py`. The WhatsApp export's "Kiana Lotfi / WhatsApp Business Account" caption is auto-cropped out; the IG card is used as-is (handle text + gradient border are the brand). Rendered through `.qr-frame--photo`, which strips the white outer card so the images carry their own design against the navy contact gradient.
- **Map:** Google Maps embed iframe pointed at Dhaka city (no pin) — reflecting that the practice is mobile across chambers in Dhaka rather than tied to one address. Inline comment in `index.html` explains how to swap it for a specific embed if she ever settles into a primary chamber.

## How to update

| Change | What to do |
|---|---|
| Copy text, colors, layout | Edit `index.html`, commit, push. |
| Hero photo | Replace `photo.jpg`, run `python _build_inline.py`, commit both. |
| Instagram QR | Export a fresh QR card from the IG app, save it over `insta-qr.jpg`, run `python _build_inline.py`, commit. |
| WhatsApp QR | Export from WhatsApp → "Share my contact", save it over `whatsapp-qr.jpg`, run `python _build_inline.py`. The script auto-crops the "Kiana Lotfi / WhatsApp Business Account" caption; if WhatsApp changes that layout, eyeball the result in `index.html` and adjust `top_skip` in `autocrop_qr()` if needed. |
| Practice / service area / availability | Edit the `<section id="location">` block in `index.html` directly. Title is "Where I see patients"; copy reflects a mobile, multi-chamber practice. |
| Map embed | Replace the `<iframe src="...">` value inside the `.map-wrapper` div per the inline comment. Default is a Dhaka city overview (no pin). |

## The build script (`_build_inline.py`)

One-shot rebuilder for the embedded assets. Run it whenever any of the source images change. It:
1. Downsamples `photo.jpg` to 640px wide, q80 JPEG, ~58 KB.
2. Resizes `insta-qr.jpg` to ~320px and inlines as base64 PNG.
3. Auto-crops `whatsapp-qr.jpg` to remove the caption band, resizes to ~320px, inlines as base64 PNG.
4. String-replaces the relevant `<img>` data URIs inside `index.html` and writes back.

Idempotent — re-running with the same source images reproduces the same output. Matches each `<img>` by its `alt=` text, so replacing one source image won't disturb the others.

Dependencies: `pip install pillow numpy`.

## Brand & content references

- **Practitioner:** Dr. Kiana (drop the surname — site uses first name only by design).
- **Email:** `kyanalotfi96@gmail.com` (the literal email, separate from her display name; do not strip "lotfi" from this).
- **Instagram:** [@drkyana](https://instagram.com/drkyana)
- **WhatsApp:** `+8801614369673` → `https://wa.me/8801614369673`
- **Practice model:** freelance — sees patients at multiple chambers across Dhaka, Bangladesh. Appointment location is set per booking. No single fixed clinic address.
- **Brand color:** `#0f4c81` (deep blue), accent `#3b82f6`. Body text `#0f172a`, muted `#475569`. Backgrounds `#ffffff` / `#f8fafc`.
- **Typography:** Google Fonts Poppins, weights 300/400/600/700.

## Out of scope (don't pull this in without asking)

- **Patient management UX** — appointment booking, intake forms, patient records. She'll use AppSheet / Google Forms separately. If a future ask is "build the intake flow," confirm whether AppSheet is still the plan first.
- **Anthropic API integration** — discussed but not warranted yet. Revisit only if AI features (intake summarization, WhatsApp triage drafts) become useful at real volume.
- **Backend, database, auth, CMS** — none of that. This is a static page.
- **Multi-page routing** — it's intentionally a single anchored page.

## Useful gotchas

- The hero `<img>` has an `onerror` fallback that swaps in a `👩‍⚕️` emoji circle if the photo data URI ever fails to decode. Keep the fallback when editing.
- The hero `::after` pseudo-element renders the same photo as a heavy-blur backdrop (`filter: blur(70px)`, opacity 0.32). Lives behind a `z-index: -2` layer with `isolation: isolate` on `.hero` to clip it. Don't remove `isolation: isolate` without re-checking stacking context.
- The QR cards use the `.qr-frame--photo` modifier (no white background, no padding) so the IG card's gradient border and the WhatsApp card's white area sit directly on the contact section's navy gradient. If you swap that background, the WhatsApp QR (white field, no border) will lose definition — recheck contrast or re-add a frame for that one card.
- File is committed with LF line endings (`newline="\n"` in the build script). If a Windows editor flips them to CRLF, GH Pages still serves fine but git diffs get noisy.
