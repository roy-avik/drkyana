# drkyana

Single-page portfolio site for **Dr Kyana**, dental surgeon (Dhaka). Tagline: _Modern dentistry. Considered care._ Deployed via GitHub Pages at <https://roy-avik.github.io/drkyana/>.

This README is the operator's guide. Architectural background, brand voice, and "don't reintroduce X" notes live in [`CLAUDE.md`](./CLAUDE.md).

## Layout

```
.
├── index.html         # The whole site. Inline CSS + JS, base64 photo + QR codes.
├── assets/            # Source images (jpeg/png) used by the build script.
│   ├── photo.jpg
│   ├── insta-qr.png
│   └── whatsapp-qr.jpg
├── locales/           # Translation strings, one YAML per language.
│   ├── en.yaml        # Reference locale (English).
│   ├── fa.yaml        # Persian / Farsi.
│   └── bn.yaml        # Bengali.
└── scripts/
    ├── build_inline.py  # Re-embeds assets/* as base64 into index.html.
    └── locales.py       # Lint & manage the locale files.
```

## How copy works

Every translatable element in `index.html` carries a `data-i18n="some.key"` attribute. On load, `index.html` reads `locales/<lang>.yaml` over `fetch()`, parses it with a tiny inline reader, and writes the values into the matching elements. The English text in the HTML is the default — English users render correctly on first paint without a network round-trip; Persian/Bengali users see English briefly while the YAML is fetched.

The YAML format is intentionally conservative: one `key: "value"` per line, JSON-style double-quoted strings, optional `#` comments and blank lines for grouping. Don't introduce nested keys, anchors, or multi-line scalars — the browser-side parser is one regex deep.

### Editing copy

1. Open `locales/en.yaml` (and `fa.yaml`, `bn.yaml`) and change the value.
2. Run `python scripts/locales.py check` to confirm the key sets stay in sync and every `data-i18n` attribute in `index.html` resolves.
3. Commit and push. GitHub Pages re-publishes within ~30 seconds.

### Adding a new translatable string

1. In `index.html`, mark the element: `<p data-i18n="section.newkey">Default English text</p>`.
   Add `data-i18n-html="1"` if the value needs to contain inline HTML (e.g. `<br>`).
2. Add the key to every locale:
   ```bash
   python scripts/locales.py add section.newkey \
       --en "English text" \
       --fa "متن فارسی" \
       --bn "বাংলা পাঠ্য"
   ```
   Any locale without a value gets a `TODO: translate ...` stub which the linter will flag.
3. `python scripts/locales.py check`.

## Locale linter (`scripts/locales.py`)

Stdlib-only Python, designed for both humans and AI agents to edit copy without drifting locales. Commands:

| Command | Description |
|---|---|
| `check` (default) | Validate parity, syntax, and `data-i18n` usage. Exit 1 on any error. |
| `keys` | Print the canonical key list, in `en.yaml` file order. |
| `show KEY` | Print KEY's value across every locale. |
| `add KEY [--en V --fa V --bn V]` | Append KEY to every locale. Missing values get `TODO: translate ...`. |
| `rename OLD NEW` | Rename a key across every locale. |
| `remove KEY` | Delete a key from every locale. |
| `sort` | Reorder non-`en` locales to match `en.yaml`'s key order. Noisy diff — use sparingly. |

`check` is the single command to run before committing. It catches:
- Missing/extra keys per locale.
- Duplicate keys within a locale.
- Empty values and `TODO:` placeholders (warnings).
- `data-i18n` attributes in `index.html` with no matching key (error).
- Keys defined in `en.yaml` that no element uses (warning).

## Build script (`scripts/build_inline.py`)

Re-runs whenever any image in `assets/` changes. It shrinks `photo.jpg` to 640px wide, crops the WhatsApp QR caption, leaves the Instagram QR at its full source resolution, and base64-inlines all three into `index.html`. Idempotent — re-running with the same sources reproduces the same file.

```bash
pip install pillow numpy
python scripts/build_inline.py
```

Match each `<img>` is done by `alt=` text, so replacing one source image doesn't disturb the others.

## Local preview

`index.html` references `locales/*.yaml` via `fetch`, which doesn't work from `file://` due to CORS. To preview locally:

```bash
python -m http.server 8000
# then visit http://localhost:8000/
```

Opening `index.html` directly will render correctly in English (the static default) but silently fail to load Persian/Bengali.
