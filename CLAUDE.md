# Dr. Kiana — Portfolio Site

Single-page promotional site for Dr. Kiana, a fresh dental graduate practicing in Dhaka North. Lives on her Instagram bio and (eventually) a business card. Patient management is **explicitly out of scope** — that's handled separately via AppSheet / Google Forms.

## What this is

One self-contained `index.html` (~192 KB). Everything inline: CSS, JS, the hero photo as a base64 JPEG data URI, both QR codes as native SVG paths. No external assets required to render. No frameworks, no build step in the deployment path.

## Architecture

- **Hosting:** GitHub Pages on this repo's `main` branch, root path. URL: `https://roy-avik.github.io/drkyana/`.
- **Source of truth:** `index.html`. Edit it directly for any copy/style change, commit, push — Pages re-publishes within ~30 seconds.
- **Photo:** embedded as base64 JPEG inside `index.html`. Original lives in the repo root as `photo.jpg`.
- **QR codes:** inline `<svg>` paths regenerated deterministically from the source URLs (`https://instagram.com/drkyana` and `https://wa.me/8801614369673`). Not raster — they scale crisply at any size and tint with `#0f172a` from CSS.
- **Map:** Google Maps embed iframe with placeholder Dhaka coordinates. Inline comment in `index.html` explains the swap-in flow.

## How to update

| Change | What to do |
|---|---|
| Copy text, colors, layout | Edit `index.html`, commit, push. |
| Hero photo | Replace `photo.jpg`, run `python _build_inline.py`, commit both. |
| QR target URLs (IG handle, WhatsApp number) | Edit the `INSTA_URL` / `WA_URL` constants at the top of `_build_inline.py`, run it, commit. |
| Clinic address / hours | Edit the `<section id="location">` block in `index.html` directly. |
| Map embed | Replace the `<iframe src="...">` value inside the `.map-wrapper` div per the inline comment. |
| Credentials timeline | Edit the three `.timeline-item` blocks under `<section id="education">` — replace the `[bracketed]` placeholders. |

## The build script (`_build_inline.py`)

One-shot rebuilder for the embedded assets. Run it whenever the hero photo or QR target URLs change. It:
1. Downsamples `photo.jpg` to 640px wide, q80 JPEG, ~58 KB.
2. Generates SVG QRs from the URL constants at the top.
3. String-replaces the relevant nodes inside `index.html` and writes back.

Idempotent for photo updates. Re-running won't re-replace the QR `<img>` tags because they've already become `<svg>` — if you change a QR URL, regenerate by deleting the existing `<svg>` block and reverting it to the placeholder `<img src="" alt="Instagram QR code for @drkyana" />` form before running, OR just edit the `<path d="...">` in the SVG by hand from the script's output.

Dependencies: `pip install qrcode pillow`.

## Brand & content references

- **Practitioner:** Dr. Kiana (drop the surname — site uses first name only by design).
- **Email:** `kyanalotfi96@gmail.com` (the literal email, separate from her display name; do not strip "lotfi" from this).
- **Instagram:** [@drkyana](https://instagram.com/drkyana)
- **WhatsApp:** `+8801614369673` → `https://wa.me/8801614369673`
- **Practice location:** Dhaka North, Bangladesh
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
- The `.qr-svg` rule in CSS recolors QR paths to the body text color. If you swap the contact section background away from the navy gradient, recheck contrast against the QR fill.
- File is committed with LF line endings (`newline="\n"` in the build script). If a Windows editor flips them to CRLF, GH Pages still serves fine but git diffs get noisy.
