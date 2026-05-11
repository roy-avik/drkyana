# drkyana

Single-page portfolio site for **Dr Kyana**, dental surgeon (Dhaka). Tagline: _Modern dentistry. Considered care._ Deployed via GitHub Pages at <https://roy-avik.github.io/drkyana/>.

This README is the operator's guide. Architectural background, brand voice, and "don't reintroduce X" notes live in [`CLAUDE.md`](./CLAUDE.md).

## Stack

Vite + React 19 + TypeScript + Tailwind v4. Anchor-scrolled SPA. Three languages (English / Persian / Bengali) via runtime-fetched YAML files. Built to a static `dist/` and deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.

## Layout

```
.
├── index.html              # Vite entry — mounts <App /> into #root.
├── src/
│   ├── main.tsx            # React root + <I18nProvider>.
│   ├── App.tsx             # Section composition.
│   ├── index.css           # Tailwind + @theme tokens + component classes.
│   ├── components/         # Header, LangSwitcher, Hero, About, Services, Location, Contact, Footer.
│   └── i18n/               # I18nProvider, useTranslation, parseYaml.
├── public/
│   ├── locales/            # Translation YAMLs (served at /drkyana/locales/<lang>.yaml).
│   └── assets/             # Optimized images (served at /drkyana/assets/...).
├── assets/                 # Source images (high-res originals).
├── scripts/
│   ├── locales.py          # Lint & manage locale YAMLs.
│   └── optimize_images.py  # assets/ -> public/assets/. Idempotent. Has --check for CI.
└── .github/workflows/deploy.yml
```

## Local development

```bash
npm install
npm run dev                # http://localhost:5173/drkyana/
npm run build              # production build -> dist/
npm run preview            # serve dist/ locally
npm run typecheck
npm run locales:check
npm run images:optimize
```

The Python scripts need `pip install pillow numpy` (only the image optimizer; the locale linter is stdlib-only).

## How copy works

Every translatable string is referenced from a component via the i18n hook:

```tsx
const { t } = useTranslation();
return <h2>{t('section.title', 'Fallback English')}</h2>;
```

`<I18nProvider>` detects the user's language (`localStorage.drkyana.lang` → `navigator.language` → default English), fetches `public/locales/<lang>.yaml`, parses it with a tiny in-browser reader, and exposes the dictionary through React context. The fallback you pass to `t()` is what fa/bn users see for the brief moment between mount and the locale fetch resolving.

YAML format is intentionally conservative: one `key: "value"` per line, JSON-style double-quoted strings, optional `#` comments and blank lines for grouping. Don't introduce nested keys, anchors, or multi-line scalars — the browser-side parser (`src/i18n/parseYaml.ts`) and the Python linter (`scripts/locales.py`) both rely on the simple format.

### Editing copy

1. Edit the matching key in **every** locale under `public/locales/`.
2. `npm run locales:check` — confirms parity and that every `t('key')` reference resolves.
3. Commit & push. CI rebuilds and Pages re-publishes within ~30 seconds.

### Adding a new translatable string

1. Add the key everywhere:
   ```bash
   python scripts/locales.py add section.newkey \
       --en "English text" \
       --fa "متن فارسی" \
       --bn "বাংলা পাঠ্য"
   ```
2. Reference it in the relevant component: `{t('section.newkey')}`.
3. `npm run locales:check`.

## Updating images

Source images live in `assets/` (high-res originals). The optimizer in `scripts/optimize_images.py` reads from `assets/` and writes optimized web-ready versions into `public/assets/` — those are what the React components import.

```bash
# Replace the source first, then:
python scripts/optimize_images.py            # rebuilds everything
python scripts/optimize_images.py --check    # CI gate: exits 1 if outputs are stale
```

| Source | Output | What the optimizer does |
|---|---|---|
| `assets/photo.jpg` | `public/assets/photo.jpg` | Resize to 1024 px wide, q82 progressive JPEG. |
| `assets/insta-qr.png` | `public/assets/insta-qr.png` | Re-encode as optimized PNG. **No resize** — the `@DRKYANA` handle stays pixel-exact. |
| `assets/whatsapp-qr.jpg` | `public/assets/whatsapp-qr.png` | Auto-crop the "Kiana Lotfi / WhatsApp Business Account" caption band, resize to 360 px, PNG. |

If WhatsApp changes its export layout and the auto-crop misbehaves, inspect the output and tweak `_autocrop_whatsapp()` in `scripts/optimize_images.py`.

Both source and optimized files are committed — the optimized ones so users get them straight from Pages, the sources so anyone can re-run the optimizer.

## Locale linter

```
python scripts/locales.py check              # default — validate everything
python scripts/locales.py keys               # canonical key list
python scripts/locales.py show KEY           # all three locales side by side
python scripts/locales.py add KEY --en .. --fa .. --bn ..
python scripts/locales.py rename OLD NEW
python scripts/locales.py remove KEY
python scripts/locales.py sort               # reorder fa/bn to match en (noisy)
```

`check` exits 1 on: missing/extra keys per locale, duplicates, unparseable lines, `t()` references in `src/` with no matching key. It warns on: empty values, `TODO:` stubs, and en.yaml keys with no `t()` consumer.

## Deployment

`.github/workflows/deploy.yml` runs on push to `main`. Steps:

1. `python scripts/locales.py check`
2. `python scripts/optimize_images.py --check`
3. `npm run typecheck`
4. `npm run build`
5. Upload `dist/` and deploy via `actions/deploy-pages`.

**Repo setup, one-time:** Settings → Pages → "Build and deployment → Source: **GitHub Actions**".

If a deploy fails, the previous build stays live.
