# Dr Kyana — Portfolio Site

Single-page promotional site for Dr Kyana, a dental surgeon consulting at chambers across Dhaka on a freelance basis (no single fixed clinic — appointment locations are confirmed per patient). Lives on her Instagram bio and (eventually) a business card. The site hosts an inline **AI receptionist** in the `#receptionist` section — an on-device intent classifier (Transformers.js + multilingual MiniLM) that classifies patient messages, then conducts a **structured 5-group dental intake** (identity, complaint, medical history, dental history, logistics) with deterministic triage before submitting directly to Google Sheets via Apps Script. AppSheet on the same Sheet is Dr Kyana's mobile management surface (email notifications for urgent intakes, status workflow, chamber schedule editing).

Brand voice: calm, considered, modern. Site tagline is **"Modern dentistry. Considered care."** Don't reintroduce "fresh graduate" framing — it was deliberately removed to project a more established, professional brand.

## What this is

A Vite + React 19 + TypeScript + Tailwind v4 SPA. Anchor-scrolled marketing site (Home / About / Services / AI receptionist / Practice / Contact) — the receptionist is an inline section, not a separate route. Three-language i18n (English / Persian / Bengali) via runtime-fetched YAML files. Built to a static bundle and deployed to Cloudflare Pages (auto-deploy on push to `main`).

**v1 audience scope:** the receptionist currently classifies messages in English and Bengali (Dr Kyana's clients). Farsi is kept in the i18n layer (marketing site translations + LangSwitcher entry) so we can light up FA receptionist intents later without re-plumbing locales — Persian patients today see the marketing site in Farsi and the receptionist UI in Farsi, but the intent examples are EN + BN only.

Repo layout:

```
index.html                    # Vite entry — mounts <App> into #root.
vite.config.ts                # base: "/" for Cloudflare Pages (drkyana.com).
tsconfig*.json
package.json

src/
  main.tsx                    # React root + <I18nProvider>.
  App.tsx                     # Section composition.
  index.css                   # Tailwind import + @theme tokens + a few component classes.
  components/
    Header.tsx                # Sticky header with nav, mobile toggle, LangSwitcher.
    LangSwitcher.tsx          # Custom dropdown (button + listbox).
    Hero.tsx
    About.tsx
    Services.tsx
    Location.tsx
    Contact.tsx               # Exports WHATSAPP_LINK for the contact section.
    Receptionist.tsx          # Inline AI receptionist chat: intent classification + slot-filling + direct submit.
    Footer.tsx
  services/
    intents.ts                # Canonical receptionist intents with example phrases (EN + BN). Intent definitions only — slot schemas moved to intakeSchema.ts.
    intentClassifier.ts       # Transformers.js wrapper: lazy-loads multilingual MiniLM, embeds + cosine matches against centroids. WASM served from jsDelivr CDN at runtime.
    intakeSchema.ts           # 5-group structured intake: slot definitions, types, options (trilingual), skip conditions, flow selection by intent.
    triage.ts                 # Deterministic rule-based dental triage (RED/ORANGE/YELLOW/GREEN). Pure function, no ML.
    chambers.ts               # Fetch chambers from Apps Script GET endpoint, sessionStorage cache, scoring/suggestion logic.
    receptionistLog.ts        # Async POST to Apps Script webhook (no-cors, keepalive). Primary submission path — returns success/failure to the UI.
  i18n/
    I18nProvider.tsx
    useTranslation.ts
    parseYaml.ts

public/
  locales/{en,fa,bn}.yaml
  assets/
    photo.jpg
    insta-qr.png
    whatsapp-qr.png
  tooth.svg                   # Favicon source.

assets/                       # SOURCE images for scripts/optimize_images.py.
  photo.jpg
  insta-qr.png
  whatsapp-qr.jpg

scripts/
  locales.py                  # Lint & manage the locale YAML files.
  optimize_images.py          # Build public/assets/* from assets/*. Has --check for CI.
  receptionist-webhook.gs     # Google Apps Script: doPost (intake persistence), doGet (chamber data), setupSheet (one-time init).

.github/workflows/
  deploy.yml                  # CI checks on push/PR: lint locales, verify optimized assets,
                              # typecheck, build. Cloudflare Pages handles deploy.
  deploy-webhook.yml          # On webhook code change: clasp push + deploy to Apps Script.
```

## Architecture

- **Hosting:** Cloudflare Pages with custom domain `drkyana.com`. Auto-builds and deploys on push to `main`. GitHub Actions (`.github/workflows/deploy.yml`) runs CI checks only (lint, typecheck, build).
- **Base path:** `/` everywhere. `vite.config.ts` sets `base: "/"` and all runtime asset references use `import.meta.env.BASE_URL` (e.g. `${BASE_URL}assets/photo.jpg`, `${BASE_URL}locales/en.yaml`).
- **Source of truth:**
  - Layout/style: `src/components/*.tsx` and `src/index.css` (Tailwind utilities + a few `@layer components` shortcuts: `.btn-primary`, `.btn-ghost`, `.card`, `.section-label`, `.container-page`).
  - Copy: `public/locales/{en,fa,bn}.yaml`. Components call `const { t } = useTranslation()` and then `t('section.key', 'optional fallback')`. The fallback is what shows during the brief moment between mount and the locale fetch resolving (for fa/bn sessions — en is what static HTML already says, so it's instant).
  - Source images: `assets/` (root). Optimized output lives in `public/assets/`. Re-run `python scripts/optimize_images.py` whenever you change a source image.
- **Tailwind v4:** CSS-first config. The `@theme` block in `src/index.css` defines brand tokens (`--color-brand`, `--color-accent`, etc.) — those become `bg-brand`, `text-accent`, `ring-ink/5` utilities automatically. No `tailwind.config.ts` needed.
- **i18n:** `I18nProvider` reads `localStorage.drkyana.lang` or falls back to `navigator.language` (`fa*` → Persian, `bn*` → Bengali, else English), then `fetch`es `public/locales/<lang>.yaml`, parses it with the tiny reader, and exposes `t()` via context. It also sets `<html lang>` and `<html dir>` (rtl for Persian), and swaps `<title>` / `<meta description>` per locale. First locale resolution flips `<body>` to `is-ready` to fade the page in. YAML format is intentionally conservative — one `key: "value"` per line, JSON-style double-quoted strings — so the browser parser (`src/i18n/parseYaml.ts`) and the Python linter (`scripts/locales.py`) stay trivial. Don't introduce nesting, anchors, or multi-line scalars without upgrading both.
- **Language switcher:** `src/components/LangSwitcher.tsx`. Custom button + `role="listbox"` dropdown — solves the broken-`g` problem the native `<select>` had (chevron clipping descenders), and renders each language in its own script (Persian with `dir="rtl"` and the Vazirmatn font, Bengali with Noto Sans Bengali). Full keyboard support (Arrow/Home/End/Enter/Esc) and click-outside dismiss.
- **Map:** Google Maps embed iframe pointed at Dhaka city (no pin) — reflecting that the practice is mobile across chambers in Dhaka. Inline comment in `Location.tsx` explains how to swap it for a specific embed if she ever settles into a primary chamber.
- **AI receptionist:** inline `<Receptionist/>` section between Services and Location. The section starts in a **standby** state showing a "Describe your problem" button. The model (`@huggingface/transformers` v4 + `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, q8 quantized, ~120 MB from the HuggingFace CDN) **preloads on IntersectionObserver** — only when the section scrolls within 600 px of the viewport — and is cached in Cache Storage (`env.useBrowserCache`). On data-saver connections (`navigator.connection.saveData === true`) auto-preload is skipped and the patient must explicitly confirm via a "Download anyway" gate. We request persistent storage via `navigator.storage.persist()` before loading so the browser doesn't evict the cached model under quota pressure. Cold-start failures retry with 1s/3s/9s exponential backoff; if all retries exhaust the patient sees a "Try again / Message Dr Kyana directly" recovery screen. On standby, a probe of Cache Storage detects whether the model is already cached on this device and only shows the "First time? About 120 MB downloads…" hint when it isn't. The ONNX Runtime WASM is auto-resolved by transformers.js v4 from `onnxruntime-web` on jsDelivr — we strip the copies Vite would otherwise emit via a post-build plugin in `vite.config.ts`. When the patient clicks the button: if the model is ready, the chat panel appears instantly; if still loading, a progress spinner is shown until ready. All embedding + classification happens in the patient's browser; nothing leaves the device until they tap "Submit to Dr Kyana." Intent definitions and example phrases live in `src/services/intents.ts`. The classifier ranks each canonical intent by cosine similarity over the mean of its example embeddings; below `OTHER_THRESHOLD` (0.42) we fall back to the `other` intent and forward the raw message verbatim.
  - **Intake flow:** Clinical intents (`book_appointment`, `urgent`, `reschedule`) enter a structured 5-group intake defined in `src/services/intakeSchema.ts`: identity (name, phone, email, age, gender) → complaint (area, symptoms, duration, severity, triggers) → medical history (conditions, allergies, medications) → dental history (last visit, anxiety) → logistics (area, days, time, urgency, payment). Urgent intents get a fast-track flow (identity + complaint only). Info intents (hours, location, pricing, etc.) remain one-shot templated responses.
  - **Triage:** After complaint data is collected, `src/services/triage.ts` runs deterministic rules: RED (immediate attention — swelling+high severity, uncontrolled bleeding), ORANGE (priority), YELLOW (soon), GREEN (routine). RED/ORANGE skip remaining groups and fast-track to submit.
  - **Consent gate:** Before health questions, a notice explains data will be shared only with Dr Kyana. Patient must acknowledge to proceed, or exit the intake flow.
  - **Submission:** On clicking "Submit to Dr Kyana", `src/services/receptionistLog.ts` posts all collected data (patient identity, complaint, medical history, dental history, logistics) to the Apps Script webhook via `no-cors` fetch. The UI shows a loading state during submission and confirms success or shows a retry prompt on failure. All data — including medical details — goes to the Google Sheet, which is Dr Kyana's sole data store.
  - **Email notifications:** The Apps Script `doPost()` handler calls `notifyUrgent()` after persisting an intake. RED and ORANGE triage intakes trigger an email to Dr Kyana with patient name, phone, intent, and a message excerpt.
  - **Chamber management:** Dr Kyana edits a "Chambers" tab in the same Google Sheet. The Apps Script `doGet()` endpoint serves active chambers as JSON. `src/services/chambers.ts` fetches at runtime, caches in sessionStorage (5-minute TTL), and `suggestChamber()` scores by service match, area, and schedule overlap.
  - **No authentication.** Firebase Phone Auth was evaluated and removed (cost). Phone and email are collected as regular intake fields. Identity is confirmed when Dr Kyana's team contacts the patient.

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
| Receptionist visible copy | Locale keys under `receptionist.*`. Run `python scripts/locales.py add receptionist.foo --en "..." --fa "..." --bn "..."` for new strings. |
| Receptionist intents | `src/services/intents.ts`. Each intent has 5–10 example phrases (mix EN + BN) — these are mean-pooled into a centroid the classifier matches against. Add a phrase patients are likely to use that's failing to match. To add a new intent, also add `receptionist.intent.<id>.response` to the locales. |
| Intake slots / groups | `src/services/intakeSchema.ts` defines intake groups, slot order, option chips (trilingual), skip conditions, and flow selection by intent. To add a slot: add it to the relevant group, add its `intake.slot.<id>.ask` key to all locales, and add chip option labels if applicable. |
| Triage rules | `src/services/triage.ts`. Deterministic symptom-combination rules — no ML. Each rule maps to a level (RED/ORANGE/YELLOW/GREEN) and an action (fast_track / priority / normal). Add new rules as dental scenarios arise. |
| Chamber data | Dr Kyana edits the "Chambers" tab in Google Sheets directly (or via AppSheet). No code change needed. `src/services/chambers.ts` fetches and caches. To change the scoring logic for `suggestChamber()`, edit that file. |
| Apps Script webhook | `scripts/receptionist-webhook.gs`. To redeploy: paste into Apps Script editor, run `setupSheet()` if tabs changed, deploy as web app. The script validates `WEBHOOK_TOKEN` from script properties against the `token` field in POST body. `doPost()` also calls `notifyUrgent()` — sends email for RED/ORANGE triage intakes. |

## Local development

```
npm install                # once
npm run dev                # vite dev server, http://localhost:5173/
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

## Deployment

### Site — Cloudflare Pages (auto-deploy)

Cloudflare Pages is connected to `roy-avik/drkyana` on GitHub and auto-builds on push to `main`:
- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Environment variables** (set in Cloudflare Pages dashboard): `VITE_SHEETS_WEBHOOK_URL`, `VITE_SHEETS_TOKEN`

GitHub Actions (`.github/workflows/deploy.yml`) runs **CI checks only** on push and PRs:
1. Lints locales (`python scripts/locales.py check`).
2. Verifies optimized assets aren't stale (`python scripts/optimize_images.py --check`).
3. Typechecks (`npm run typecheck`).
4. Builds (`npm run build`) — verifies the build succeeds but does not deploy.

### Apps Script CI (`.github/workflows/deploy-webhook.yml`)

When `scripts/receptionist-webhook.gs` or `scripts/appsscript.json` changes on `main`, a separate workflow pushes the code to Google Apps Script via [`clasp`](https://github.com/google/clasp) and updates the live web app deployment. Also triggerable via `workflow_dispatch`.

**One-time setup:**
1. Create a **Google Cloud project** at [console.cloud.google.com](https://console.cloud.google.com).
2. Enable the **Apps Script API** (APIs & Services → Library → search "Apps Script API").
3. Create **OAuth credentials** (APIs & Services → Credentials → Create → OAuth Client ID → Desktop app). Download the JSON.
4. Install clasp locally: `npm install -g @google/clasp`.
5. Run `clasp login --creds <downloaded-creds.json>`. This opens a browser consent flow and writes `~/.clasprc.json`.
6. Create a **Google Sheet** in your Google account.
7. Open **Apps Script** from the Sheet (Extensions → Apps Script). Copy the **Script ID** from the URL (`https://script.google.com/home/projects/<SCRIPT_ID>/edit`).
8. Paste `scripts/receptionist-webhook.gs` into Code.gs. Run `setupSheet()` once. Set Script Properties: `WEBHOOK_TOKEN` (a random secret) and `SHEET_ID` (the Sheet ID from its URL).
9. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone. Copy the **Deployment URL** and the **Deployment ID** (shown in "Manage deployments").
10. Set the following **repo secrets** (Settings → Secrets → Actions):

| Secret | Value | Source |
|--------|-------|--------|
| `CLASP_CREDENTIALS` | Contents of `~/.clasprc.json` | Step 5 |
| `APPS_SCRIPT_ID` | Script project ID | Step 7 |
| `APPS_SCRIPT_DEPLOYMENT_ID` | Web app deployment ID | Step 9 |

The site's build-time secrets (`VITE_SHEETS_WEBHOOK_URL`, `VITE_SHEETS_TOKEN`) are set in the **Cloudflare Pages dashboard** (not GitHub repo secrets), since Cloudflare handles the production build.

After this, every push that touches the webhook code auto-deploys to Apps Script. The site build injects the webhook URL and token at compile time (via Cloudflare Pages environment variables). Both are absent in local dev — persistence and chamber fetch silently skip when the env vars are empty.

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
- **Always pull `main` before starting a new branch.** This repo is actively developed on both cloud & local environments, and Cloudflare Pages auto-deploys from `main` — if your branch diverges too much, you risk merge conflicts or even build breakage when the deploy runs. Pulling latest `main` before starting a new branch keeps you up to date with recent changes and reduces friction at merge time.

## Out of scope (don't pull this in without asking)

- **Free-form patient management UX beyond AppSheet** — the site collects structured intake and persists to Google Sheets. Dr Kyana manages everything downstream (scheduling, follow-up, status) via AppSheet. Don't build an in-browser patient dashboard, calendar, or status tracker.
- **Patient authentication.** Firebase Phone Auth was evaluated ($0.20/SMS) and removed. Phone and email are collected as regular fields. Don't re-introduce auth (Firebase, email magic links, OTP) without confirming the cost/benefit tradeoff.
- **Generative responses.** The receptionist is a classifier with templated responses, not a chat LLM. We picked this on purpose (no hallucination, no medical advice, smaller download). Do not swap in a generative model (`xenova/qwen`, etc.) without confirming the tradeoff with the user.
- **Anthropic API integration** — discussed but not warranted yet. The on-device classifier covers the receptionist use case.
- **Backend, database, auth, CMS** — the site remains a static SPA. Persistence is async POST to Google Sheets via Apps Script (the only data store). No server, no database, no login.
- **PWA install / standalone shell.** Removed when the receptionist moved inline. The site is plain HTTPS, no service worker, no manifest. If we ever want offline support, vite-plugin-pwa fits cleanly back in.
- **Google Workspace.** Free Google account suffices for Sheets + Apps Script + AppSheet free tier. Workspace ($15/mo) can be added later for custom email on drkyana.com (enables BAA for health data). Not needed now.

## Deferred

- **Farsi receptionist intents.** Today the multilingual MiniLM model embeds Farsi into the same vector space as English/Bengali so FA messages "kind of work" — but the canonical example phrases in `src/services/intents.ts` are EN + BN only. Add FA phrases per intent to lift accuracy when she onboards her first Iranian patients.
- **Automated appointment confirmations.** When email is set up on drkyana.com (via Google Workspace), Apps Script can send confirmation emails after Dr Kyana marks an intake as "scheduled." Not possible until custom email is live.
- **Web Worker for inference.** The classifier currently runs on the main thread. For long inputs / slower devices, move `pipeline` + `embed` into a Worker so the chat UI never jank-stalls.
- **CDN-pinned wasm version.** `intentClassifier.ts` points `wasmPaths` at `@huggingface/transformers@3` on jsDelivr — pin a specific subversion before going live to avoid CDN drift breaking inference unannounced.

## RTL / Farsi caution

Persian (Farsi) is a right-to-left script. **Do not set `dir="rtl"` on the `<html>` element.** We tried it — it flips every flexbox and grid on the page (nav order reverses, hero photo jumps to the wrong side, etc.). Instead we keep `dir="ltr"` always and rely on the Unicode Bidirectional Algorithm: Farsi characters are intrinsically RTL (Unicode bidi category AL/R), so they render in the correct right-to-left reading order inside any `<p>` or `<h*>` without any extra markup.

Rules to follow when editing `I18nProvider.tsx` or adding a new RTL language:
- **Never** set `document.documentElement.dir = 'rtl'` (or any per-language `dir` value). Always write `'ltr'`.
- If you need per-paragraph text alignment for Farsi, add `html[lang="fa"] p { text-align: right }` (or similar) in `src/index.css` — that keeps the layout intact while right-aligning copy.
- The LangSwitcher dropdown is already `right-0` / `left-0`-aware — don't introduce a separate RTL-flip there either.
- If you add Arabic, Hebrew, or another RTL script in the future, apply the same pattern: force `dir="ltr"` on `<html>`, handle text alignment in CSS per `html[lang]`.

## Useful gotchas

- The hero `<img>` has an `onError` fallback that hides the broken image and reveals a `👩‍⚕️` emoji circle. Keep both elements when editing.
- Vite serves `public/` at the configured `base` path. References must use `${import.meta.env.BASE_URL}assets/...` (with the trailing slash already on BASE_URL) — don't hardcode paths.
- The custom dropdown's listbox is positioned `right-0` by default and flips to `left-0` for RTL (Persian). If you add a fourth language with another script, double-check this still anchors sensibly.
- Tailwind v4 `@theme` tokens become utilities automatically for colors. Font tokens (`--font-fa`, `--font-bn`) are referenced via `font-[var(--font-fa)]` arbitrary syntax in the LangSwitcher — keep that pattern if you add another scripted language.
- **Cloudflare Pages build settings** must stay in sync: build command `npm run build`, output directory `dist`. The `VITE_SHEETS_WEBHOOK_URL` and `VITE_SHEETS_TOKEN` environment variables are set in the Cloudflare dashboard, not in code. The Cloudflare project must remain connected to the GitHub repo — if disconnected, pushes won't trigger builds.
