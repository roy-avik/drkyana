# Dr Kyana — Portfolio Site

Single-page promotional site for Dr Kyana, a dental surgeon consulting at chambers across Dhaka on a freelance basis (no single fixed clinic — appointment locations are confirmed per patient). Lives on her Instagram bio and (eventually) a business card. Free-form patient management is **out of scope** — that's handled separately via AppSheet / Google Forms. The one structured intake the site does host is the **Quick Check PWA** at `#/quick-check`: an installable Chrome-only tool that runs on-device AI triage and hands off to WhatsApp. It does not yet persist anything — see "Deferred" below.

Brand voice: calm, considered, modern. Site tagline is **"Modern dentistry. Considered care."** Don't reintroduce "fresh graduate" framing — it was deliberately removed to project a more established, professional brand.

## What this is

A Vite + React 19 + TypeScript + Tailwind v4 SPA. Anchor-scrolled marketing site (Home / About / Services / Practice / Contact) plus one hash-routed standalone surface (`#/quick-check`) that doubles as an installable Chrome PWA. Three-language i18n (English / Persian / Bengali) via runtime-fetched YAML files. Built to a static bundle and deployed to GitHub Pages by a GH Actions workflow.

Repo layout:

```
index.html                    # Vite entry — mounts <App> into #root.
vite.config.ts                # base: "/drkyana/" for GH Pages.
tsconfig*.json
package.json

src/
  main.tsx                    # React root + <I18nProvider>.
  App.tsx                     # Hash-route switch: marketing site or <QuickCheckApp/>.
  router.ts                   # useHashRoute() — tiny hashchange-subscribed hook.
  index.css                   # Tailwind import + @theme tokens + a few component classes.
  components/
    Header.tsx                # Sticky header with nav, mobile toggle, LangSwitcher.
    LangSwitcher.tsx          # Custom dropdown (button + listbox).
    Hero.tsx
    About.tsx
    Services.tsx
    Location.tsx
    Contact.tsx               # Exports WHATSAPP_LINK as the one source of truth.
    QuickCheck.tsx            # Exports <QuickCheckBody/> — the edge-AI triage card body.
    QuickCheckCta.tsx         # Homepage CTA pointing at #/quick-check.
    InstallPrompt.tsx         # Captures beforeinstallprompt; handles iOS / standalone.
    Footer.tsx
  routes/
    QuickCheckApp.tsx         # Standalone PWA shell wrapping <QuickCheckBody/>.
  i18n/
    I18nProvider.tsx
    useTranslation.ts
    parseYaml.ts

public/
  locales/{en,fa,bn}.yaml
  icons/
    quick-check-{192,512,maskable}.png   # PWA manifest icons (generated).
  assets/
    photo.jpg
    insta-qr.png
    whatsapp-qr.png
  tooth.svg                   # Favicon + PWA icon source.

assets/                       # SOURCE images for scripts/optimize_images.py.
  photo.jpg
  insta-qr.png
  whatsapp-qr.jpg

scripts/
  locales.py                  # Lint & manage the locale YAML files.
  optimize_images.py          # Build public/assets/* from assets/*. Has --check for CI.
  generate_pwa_icons.py       # Rasterize public/tooth.svg into public/icons/*.png.

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
- **Quick Check PWA:** the `#/quick-check` route renders `<QuickCheckApp/>` instead of the marketing site. It hosts `<QuickCheckBody/>` (Chrome Prompt API triage from PR #14) plus an install prompt. `vite-plugin-pwa` emits the manifest and service worker; `start_url` is `/drkyana/#/quick-check` so installed launches go straight to the tool. iOS users see an honest "Apple won't let any iPhone browser run on-device AI" notice instead of a misleading "install Chrome" prompt — every iOS browser is forced onto WebKit, so Chrome iOS can't run the Prompt API either. Hash routing was chosen over path routing because GH Pages has no SPA fallback rewrite. The homepage advertises the route via a single compact CTA card (`<QuickCheckCta/>`); the marketing nav has no link to it (the PWA shell has its own header).

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
| Quick Check copy or triage prompt | Locale keys under `quickCheck.*` for visible strings. System prompt is the `SYSTEM_PROMPT` constant in `src/components/QuickCheck.tsx` — keep it conservative (no diagnosis, no medication names). |
| PWA install copy or behaviour | `src/components/InstallPrompt.tsx` for the install button / iOS notice / chrome-only fallback. Manifest fields (name, start_url, theme color, icons) live in `vite.config.ts` under the `VitePWA({ manifest: ... })` block. |
| PWA icons | Replace `public/tooth.svg`, run `python3 scripts/generate_pwa_icons.py` (needs `pip install cairosvg pillow`), commit both the SVG and the regenerated PNGs in `public/icons/`. |

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

Python deps for the helper scripts: `pip install pillow numpy cairosvg` (cairosvg only needed by `generate_pwa_icons.py`).

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

- **Free-form patient management UX** — appointment booking, intake forms, patient records. The Quick Check PWA emits a single triage payload (urgency / category / WhatsApp handoff) and is the only structured intake the site touches. Everything broader stays on AppSheet / Google Forms separately. If a future ask is "build the intake flow," confirm whether AppSheet is still the plan first.
- **Persistence of Quick Check submissions.** Sketched in "Deferred" — Google Sheet + Apps Script proxy + AppSheet on top — but explicitly not implemented in the current build. Do not add a fetch from `<QuickCheckBody/>` to any remote endpoint without confirming first.
- **Anthropic API integration** — discussed but not warranted yet. Revisit only if AI features (intake summarization, WhatsApp triage drafts) become useful at real volume.
- **Backend, database, auth, CMS** — none of that. Still a static page, just compiled.
- **Path-based routing (e.g. `/quick-check`).** GH Pages doesn't do SPA fallback rewrites; hash routing is intentional. Migrating later would need a `404.html` redirect shim.
- **iOS install.** Apple forces every iOS browser onto WebKit, so neither Safari nor Chrome iOS can run the Prompt API. iOS Safari's "Add to Home Screen" would produce a working shell but a non-functional triage; we deliberately don't promote install on iOS.

## Deferred

- **Persistence of Quick Check submissions to a Google Sheet, with AppSheet as Dr Kyana's mobile management surface.** Shape: ~30-line Apps Script web app deployed as anyone-can-execute, URL stored as the `SHEETS_WEBHOOK_URL` repo secret and injected at build time as `VITE_SHEETS_WEBHOOK_URL`. Client-side, a `src/services/triageLog.ts` would `fetch` (`mode: 'no-cors'`, `Content-Type: text/plain`, `keepalive: true`) on the WhatsApp-button click, best-effort, silent failure. AppSheet on the same Sheet gives her push notifications for `urgency=urgent` and a `new / contacted / scheduled / done / closed` status workflow without touching the raw sheet. Direct AppSheet REST API was ruled out because its `ApplicationAccessKey` would leak in the public bundle.
- **PWA icon artwork.** Current icons are auto-rasterized from `public/tooth.svg` (white tooth on brand-navy). Replace `tooth.svg` and re-run `python3 scripts/generate_pwa_icons.py` to update.

## RTL / Farsi caution

Persian (Farsi) is a right-to-left script. **Do not set `dir="rtl"` on the `<html>` element.** We tried it — it flips every flexbox and grid on the page (nav order reverses, hero photo jumps to the wrong side, etc.). Instead we keep `dir="ltr"` always and rely on the Unicode Bidirectional Algorithm: Farsi characters are intrinsically RTL (Unicode bidi category AL/R), so they render in the correct right-to-left reading order inside any `<p>` or `<h*>` without any extra markup.

Rules to follow when editing `I18nProvider.tsx` or adding a new RTL language:
- **Never** set `document.documentElement.dir = 'rtl'` (or any per-language `dir` value). Always write `'ltr'`.
- If you need per-paragraph text alignment for Farsi, add `html[lang="fa"] p { text-align: right }` (or similar) in `src/index.css` — that keeps the layout intact while right-aligning copy.
- The LangSwitcher dropdown is already `right-0` / `left-0`-aware — don't introduce a separate RTL-flip there either.
- If you add Arabic, Hebrew, or another RTL script in the future, apply the same pattern: force `dir="ltr"` on `<html>`, handle text alignment in CSS per `html[lang]`.

## Useful gotchas

- The hero `<img>` has an `onError` fallback that hides the broken image and reveals a `👩‍⚕️` emoji circle. Keep both elements when editing.
- Vite serves `public/` at the configured `base` path. References must use `${import.meta.env.BASE_URL}assets/...` (with the trailing slash already on BASE_URL) — don't hardcode `/drkyana/`.
- The custom dropdown's listbox is positioned `right-0` by default and flips to `left-0` for RTL (Persian). If you add a fourth language with another script, double-check this still anchors sensibly.
- Tailwind v4 `@theme` tokens become utilities automatically for colors. Font tokens (`--font-fa`, `--font-bn`) are referenced via `font-[var(--font-fa)]` arbitrary syntax in the LangSwitcher — keep that pattern if you add another scripted language.
- **GitHub Pages source must be set to "GitHub Actions"** (repo Settings → Pages → Build and deployment → Source). If it's set to "Deploy from a branch", GH Pages serves the raw `index.html` (which has `src="/src/main.tsx"`) and the site goes blank. The deploy workflow uploads `dist/` as a Pages artifact — that only takes effect when the source is "GitHub Actions".
