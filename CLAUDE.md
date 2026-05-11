# Dr Kyana — Portfolio Site

Single-page promotional site for Dr Kyana, a dental surgeon consulting at chambers across Dhaka on a freelance basis (no single fixed clinic — appointment locations are confirmed per patient). Lives on her Instagram bio and (eventually) a business card. Patient management is **explicitly out of scope** — that's handled separately via AppSheet / Google Forms.

Brand voice: calm, considered, modern. Site tagline is **"Modern dentistry. Considered care."** Don't reintroduce "fresh graduate" framing — it was deliberately removed to project a more established, professional brand.

## What this is

A Vite + React 19 + TypeScript + Tailwind v4 SPA. Anchor-scrolled sections (Home / About / Services / Practice / Contact), three-language i18n (English / Persian / Bengali) via runtime-fetched YAML files. Built to a static bundle and deployed to GitHub Pages by a GH Actions workflow.

Repo layout:

```
index.html                    # Vite entry — mounts <App> into #root.
vite.config.ts                # base: "/drkyana/" for GH Pages.
tsconfig*.json
package.json

src/
  main.tsx                    # React root + <I18nProvider>.
  App.tsx                     # Section composition.
  index.css                   # Tailwind import + @theme tokens + a few component classes.
  components/
    Header.tsx                # Sticky header with nav, mobile toggle, LangSwitcher.
    LangSwitcher.tsx          # Custom dropdown (button + listbox) — globe / native script / chevron.
    Hero.tsx                  # Photo + headline + CTAs.
    About.tsx
    Services.tsx              # 3-card grid.
    Location.tsx              # Service-area card + Google Maps embed.
    Contact.tsx               # Email / IG / WhatsApp cards with QR images.
    Footer.tsx
  i18n/
    I18nProvider.tsx          # React context: detects lang, fetches yaml, caches, swaps <html lang/dir>.
    useTranslation.ts         # Hook returning { lang, setLang, t, ready }.
    parseYaml.ts              # Tiny parser matching the conservative format.

public/
  locales/{en,fa,bn}.yaml     # Source of truth for translations. Served at /drkyana/locales/<lang>.yaml.
  assets/
    photo.jpg                 # Optimized hero photo (1024 px).
    insta-qr.png              # Instagram QR (pixel-exact at source resolution).
    whatsapp-qr.png           # WhatsApp QR (caption stripped, ~360 px).

assets/                       # SOURCE images (high-res originals). Read by scripts/optimize_images.py.
  photo.jpg
  insta-qr.png
  whatsapp-qr.jpg

scripts/
  locales.py                  # Lint & manage the locale YAML files.
  optimize_images.py          # Build public/assets/* from assets/*. Has --check for CI.

.github/workflows/deploy.yml  # On push to main: lint locales, verify optimized assets,
                              # typecheck, build, deploy to Pages.
```

## Architecture

- **Hosting:** GitHub Pages on this repo, served from the `dist/` artifact built by `.github/workflows/deploy.yml`. URL: `https://roy-avik.github.io/drkyana/`.
- **Base path:** `/drkyana/` everywhere. `vite.config.ts` sets `base: "/drkyana/"` and all runtime asset references use `import.meta.env.BASE_URL` (e.g. `${BASE_URL}assets/photo.jpg`, `${BASE_URL}locales/en.yaml`). If the repo is ever renamed, update one line in `vite.config.ts`.
- **Source of truth:**
  - Layout/style: `src/components/*.tsx` and `src/index.css` (Tailwind utilities + a few `@layer components` shortcuts: `.btn-primary`, `.btn-ghost`, `.card`, `.section-label`, `.container-page`).
  - Copy: `public/locales/{en,fa,bn}.yaml`. Components call `const { t } = useTranslation()` and then `t('section.key', 'optional fallback')`. The fallback is what shows during the brief moment between mount and the locale fetch resolving (for fa/bn sessions — en is what static HTML already says, so it's instant).
  - Source images: `assets/` (root). Optimized output lives in `public/assets/`. Re-run `python scripts/optimize_images.py` whenever you change a source image.
- **Tailwind v4:** CSS-first config. The `@theme` block in `src/index.css` defines brand tokens (`--color-brand`, `--color-accent`, etc.) — those become `bg-brand`, `text-accent`, `ring-ink/5` utilities automatically. No `tailwind.config.ts` needed.
- **i18n:** `I18nProvider` reads `localStorage.drkyana.lang` or falls back to `navigator.language` (`fa*` → Persian, `bn*` → Bengali, else English), then `fetch`es `public/locales/<lang>.yaml`, parses it with the tiny reader, and exposes `t()` via context. It also sets `<html lang>` and `<html dir>` (rtl for Persian), and swaps `<title>` / `<meta description>` per locale. First locale resolution flips `<body>` to `is-ready` to fade the page in. YAML format is intentionally conservative — one `key: "value"` per line, JSON-style double-quoted strings — so the browser parser (`src/i18n/parseYaml.ts`) and the Python linter (`scripts/locales.py`) stay trivial. Don't introduce nesting, anchors, or multi-line scalars without upgrading both.
- **Language switcher:** `src/components/LangSwitcher.tsx`. Custom button + `role="listbox"` dropdown — solves the broken-`g` problem the native `<select>` had (chevron clipping descenders), and renders each language in its own script (Persian with `dir="rtl"` and the Vazirmatn font, Bengali with Noto Sans Bengali). Full keyboard support (Arrow/Home/End/Enter/Esc) and click-outside dismiss.
- **Map:** Google Maps embed iframe pointed at Dhaka city (no pin) — reflecting that the practice is mobile across chambers in Dhaka. Inline comment in `Location.tsx` explains how to swap it for a specific embed if she ever settles into a primary chamber.

## How to update

| Change | What to do |
|---|---|
| Copy text | Edit the matching key in **every** locale under `public/locales/`, then run `python scripts/locales.py check`. Components reference keys via `t('foo.bar', 'fallback')` — make sure new keys have a `t()` consumer somewhere in `src/`. |
| Add a translatable string | `python scripts/locales.py add section.newkey --en "..." --fa "..." --bn "..."`, then reference it in the relevant component with `{t('section.newkey')}`. |
| Layout / styling | Edit the component in `src/components/` and/or extend the `@theme` tokens in `src/index.css`. Tailwind utilities resolve at build time — `npm run dev` for the live preview. |
| Hero photo | Replace `assets/photo.jpg`, run `python scripts/optimize_images.py`, commit both source and `public/assets/photo.jpg`. |
| Instagram QR | Export a fresh QR card from the IG app, save it over `assets/insta-qr.png`, run `python scripts/optimize_images.py`. The optimizer **does not** resize this image so the `@DRKYANA` handle stays pixel-exact. |
| WhatsApp QR | Export from WhatsApp → "Share my contact", save over `assets/whatsapp-qr.jpg`, run the optimizer. The script auto-crops the "Kiana Lotfi / WhatsApp Business Account" caption — if WhatsApp ever changes that layout, inspect the output in `public/assets/whatsapp-qr.png` and tweak `_autocrop_whatsapp()`. |
| Practice / service area / availability | Edit copy in the locale files (keys under `location.*`). The block lives in `src/components/Location.tsx`. |
| Map embed | Replace the `MAP_SRC` constant in `src/components/Location.tsx` per the inline comment. Default is a Dhaka city overview (no pin). |

## Local development

```
npm install                # once
npm run dev                # vite dev server, http://localhost:5173/drkyana/
npm run build              # production build to dist/
npm run preview            # serve dist/ locally
npm run typecheck          # tsc -b --noEmit
npm run locales:check      # python scripts/locales.py check
npm run images:optimize    # python scripts/optimize_images.py
```

Python deps for the helper scripts: `pip install pillow numpy`.

## Scripts

Both Python scripts in `scripts/` are designed to be run by humans, agents, or CI:

### `scripts/locales.py`

Stdlib-only Python (no deps). Run before every copy change is committed:

```
python scripts/locales.py check    # default — validate parity & t() usage
python scripts/locales.py keys     # print canonical key list (en order)
python scripts/locales.py show KEY # show one key across all locales
python scripts/locales.py add KEY --en "..." --fa "..." --bn "..."
python scripts/locales.py rename OLD NEW
python scripts/locales.py remove KEY
python scripts/locales.py sort     # reorder fa/bn to match en.yaml (noisy diff)
```

`check` errors on: missing/extra keys per locale, duplicates, unparseable lines, `t()` references in `src/` with no matching key. It warns on: empty values, `TODO:` stubs, and en.yaml keys with no `t()` consumer.

### `scripts/optimize_images.py`

Requires `pillow` and `numpy`. Reads source images from `assets/` and writes optimized versions to `public/assets/`.

```
python scripts/optimize_images.py           # rebuild every output
python scripts/optimize_images.py --check   # exit 1 if any output is stale (used by CI)
```

Idempotent — running it twice produces the same bytes.

## Deployment (`.github/workflows/deploy.yml`)

On every push to `main`, the workflow:
1. Lints locales (`python scripts/locales.py check`).
2. Verifies optimized assets aren't stale (`python scripts/optimize_images.py --check`).
3. Typechecks (`npm run typecheck`).
4. Builds (`npm run build`).
5. Uploads `dist/` and deploys to GitHub Pages.

Pages re-publishes within ~30 seconds of the workflow finishing. If the workflow fails, the previous build stays live.

Pages **must** be configured to "Build and deployment → Source: GitHub Actions" in repo Settings. (Old config was "Deploy from a branch" — flip it once.)

## Brand & content references

- **Practitioner:** Dr Kyana (English spelling matches the `@drkyana` Instagram handle; Persian/Bengali keep their native spellings — کیانا / কিয়ানা). Drop the surname — site uses first name only by design.
- **Email:** `kyanalotfi96@gmail.com` (the literal email, separate from her display name; do not strip "lotfi" from this).
- **Instagram:** [@drkyana](https://instagram.com/drkyana)
- **WhatsApp:** `+8801614369673` → `https://wa.me/8801614369673`
- **Practice model:** freelance — sees patients at multiple chambers across Dhaka, Bangladesh. Appointment location is set per booking. No single fixed clinic address.
- **Brand color:** `#0f4c81` (brand), accent `#3b82f6`. Body text `#0f172a` (ink), muted `#475569`. Backgrounds `#ffffff` (surface) / `#f8fafc` (surface-alt). All exposed as Tailwind utilities (`bg-brand`, `text-muted`, etc.) via the `@theme` block in `src/index.css`.
- **Typography:** Poppins (Latin), Vazirmatn (Persian), Noto Sans Bengali — loaded from Google Fonts in `index.html`. Family swap is driven by `html[lang="fa"]` / `html[lang="bn"]` in `src/index.css`.
- **Languages:** English (default), Farsi/Persian, and Bengali. Reflects that Dr Kyana is Iranian practicing in Bangladesh.

## Workflow

- **Delete merged PR branches.** After a PR merges, the assistant runs `git branch -D <name>` locally. The remote ref cannot be deleted from this harness — `git push origin --delete` is blocked with 403 by the proxy, and no MCP tool exposes the GitHub `DELETE /git/refs/...` endpoint. Either click "Delete branch" on the merged PR, or enable **Settings → General → "Automatically delete head branches"** on the repo.

## Out of scope (don't pull this in without asking)

- **Patient management UX** — appointment booking, intake forms, patient records. She'll use AppSheet / Google Forms separately. If a future ask is "build the intake flow," confirm whether AppSheet is still the plan first.
- **Anthropic API integration** — discussed but not warranted yet. Revisit only if AI features (intake summarization, WhatsApp triage drafts) become useful at real volume.
- **Backend, database, auth, CMS** — none of that. Still a static page, just compiled.
- **Multi-page routing** — it's intentionally a single anchored page. If multi-page ever becomes a real need, add `react-router` and consider whether it's still a "promo site" or has crossed into product territory.

## Useful gotchas

- The hero `<img>` has an `onError` fallback that hides the broken image and reveals a `👩‍⚕️` emoji circle. Keep both elements when editing.
- Vite serves `public/` at the configured `base` path. References must use `${import.meta.env.BASE_URL}assets/...` (with the trailing slash already on BASE_URL) — don't hardcode `/drkyana/`.
- The custom dropdown's listbox is positioned `right-0` by default and flips to `left-0` for RTL (Persian). If you add a fourth language with another script, double-check this still anchors sensibly.
- Tailwind v4 `@theme` tokens become utilities automatically for colors. Font tokens (`--font-fa`, `--font-bn`) are referenced via `font-[var(--font-fa)]` arbitrary syntax in the LangSwitcher — keep that pattern if you add another scripted language.
