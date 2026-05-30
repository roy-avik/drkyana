# Dr Kyana — Clinical Agent Platform

Promotional site **and** clinical agent platform for **Dr Kyana**, dental surgeon consulting at chambers across Dhaka. Tagline: _Modern dentistry. Considered care._

Two front ends share one server-side agent + tool layer:

1. **Patient site + AI receptionist** (public, `drkyana.com`) — the marketing SPA with an inline AI receptionist that conducts a dental intake and persists it.
2. **Admin practice console** (private, `apps/admin`, behind Cloudflare Access) — Dr Kyana's queue + chamber editor + draft review, with an agent that drafts clinical documents, reads X-rays, researches conditions, and sends email.

This README is the operator's guide. Architectural rationale, the data-flow diagrams, brand voice, and "don't reintroduce X" notes live in [`CLAUDE.md`](./CLAUDE.md). The forward-looking punch list lives in [`~/.claude/plans/1-why-not-both-binary-cray.md`](~/.claude/plans/1-why-not-both-binary-cray.md) (out of repo).

---

## Stack

Cloudflare-native, Anthropic-only, npm-workspaces monorepo.

- **Patient SPA** — Vite + React 19 + TypeScript + Tailwind v4. Three languages (English / Persian-Farsi / Bengali) via runtime-fetched YAML. Built to `dist/` and served by **Cloudflare Pages** (project `drkyana`); `functions/api/agent/patient.ts` is a Pages Function that fronts the patient agent.
- **Admin app** (`apps/admin/`) — Next.js 16 PWA (Serwist), deployed via `@opennextjs/cloudflare` as Worker `drkyana-admin`. Cloudflare Access in front.
- **Server runtime** (`packages/server/`) — AI SDK 6 with `@ai-sdk/anthropic`. ALL prompts + tool implementations live here, server-only. Never imported into a client bundle (enforced by `scripts/check-isolation.mjs`).
- **Shared types** (`packages/types/`) — types only. The patient browser may import these. Prompts and tools must not leak through it.
- **Data:** **D1** `drkyana` (system of record), **KV** (chat sessions, jobs, rate limits), **Vectorize** `drkyana-kb` (1024-dim BGE-M3), **R2** `drkyana-media` (X-rays, generated PDFs).
- **Models** (centralised in `packages/server/src/models.ts`): `cheap` = Haiku (intake, routing, summaries), `standard` = Sonnet (admin chat, drafting), `vision` = Sonnet (radiology).

---

## Repo layout

```
.
├── index.html, vite.config.ts            # Patient SPA entry (Vite + React 19 + Tailwind v4)
├── src/                                  # Patient marketing site + receptionist UI
│   ├── components/Receptionist.tsx       #   useChat against /api/agent/patient
│   └── i18n/                             #   I18nProvider, useTranslation, parseYaml
├── public/
│   ├── locales/{en,fa,bn}.yaml           # Patient copy (conservative YAML)
│   └── assets/                           # Optimised images
├── functions/
│   └── api/agent/patient.ts              # Pages Function: KV rate-limit + D1 session + streamAgent(patient)
├── migrations/
│   ├── 0001_init.sql                     # D1 schema — sole data store
│   └── 0002_scheduling.sql               # appointments + chat transcripts
├── .skills/                              # Clinical behaviour contracts (Vercel agent-skills shape)
│   ├── README.md                         #   catalog + ownership rules
│   ├── voice-and-tone/SKILL.md           #   preload — always-on baseline
│   ├── hard-rules/SKILL.md               #   preload — never-diagnose, never-quote-price...
│   ├── consent-posture/SKILL.md          #   preload — patient surface
│   ├── triage/SKILL.md                   #   load-on-demand — RED/ORANGE/YELLOW/GREEN interpretation
│   ├── intake-collection/SKILL.md        #   load-on-demand — form-first flow
│   ├── ...                               #   one subdirectory per behaviour
│   └── sdlc/SKILL.md                     #   audience: coding-agent — the contributor checklist
│
├── packages/
│   ├── types/                            # Shared types only (no prompts)
│   └── server/                           # @drkyana/server — server-only
│       └── src/
│           ├── agents.ts                 #   AgentSpec, streamAgent/runAgent, prepareStep escalation
│           ├── agents/{patient,admin,radiology}.ts
│           ├── tools.ts                  #   defineTool, ToolSpec, needsApproval wiring
│           ├── tools/patient/*           #   collect_intake (client-rendered form),
│           │                             #     run_triage, suggest_chamber,
│           │                             #     lookup_returning_patient, submit_intake
│           ├── tools/admin/*             #   list/get intake, get/update patient memory,
│           │                             #     kb_search, draft_* (5 docs), update_status,
│           │                             #     upsert_chamber, send_receptionist_email,
│           │                             #     start_radiology_analysis, compile_pdf,
│           │                             #     appointment CRUD, transcripts
│           ├── kb/ingest.ts              #   chunk + embed -> Vectorize
│           ├── pdf/render.ts             #   PDF rendering for drafts
│           ├── scheduled/reminders.ts    #   POST /api/cron/reminders entry point
│           ├── email.ts                  #   cloudflare:email EmailMessage send
│           ├── embeddings.ts             #   Workers AI BGE-M3
│           ├── models.ts                 #   tier -> Claude model id
│           └── bindings.ts, context.ts, jobs.ts
│
├── apps/admin/                           # Next.js 16 PWA (OpenNext/Cloudflare), Cloudflare Access
│   ├── app/                              #   pages + api routes
│   ├── server/access.ts                  #   CF Access JWT verification (withAccess)
│   ├── server/db.ts                      #   parameterised D1 access
│   └── wrangler.jsonc                    #   bindings DB/KV/VECTORIZE/R2/AI/EMAIL
│
├── scripts/
│   ├── locales.py                        # i18n linter/manager (stdlib only)
│   ├── optimize_images.py                # assets/ -> public/assets/ (Pillow)
│   ├── check-isolation.mjs               # Fails build if server-only code leaks to a client bundle
│   └── bundle-skills.mjs                 # .skills/**/SKILL.md -> packages/server/src/skills/_generated.ts
│
├── wrangler.example.toml                 # Canonical bindings reference + provisioning commands
└── .github/workflows/                    # CI
```

---

## Local development

```bash
# Patient SPA
npm install
npm run dev                 # http://localhost:5173/
npm run build               # patient build -> dist/
npm run typecheck
npm run check:isolation     # fails if server-only code leaks to a client bundle
npm run locales:check
npm run images:optimize

# Server typecheck
npx tsc -p packages/server/tsconfig.json

# Admin app
cd apps/admin && npm run dev      # next dev
cd apps/admin && npm run build    # next build --webpack (Serwist needs webpack)

# D1 migrations
npm run db:migrate:local           # applies 0001_init.sql against the local D1 binding
npm run db:migrate:remote          # ... against the deployed D1

# Isolation guard against the built bundles
node scripts/check-isolation.mjs --dist
```

Python deps for the image script only: `pip install pillow numpy`. The locale linter is stdlib-only.

---

## How to update

| Change | What to do |
|---|---|
| Patient copy | Edit the key in **every** `public/locales/*.yaml`, then `npm run locales:check`. Reference via `t('foo.bar', 'fallback')`. |
| Patient receptionist behavior | Cross-cutting behaviour rules live in `.skills/<name>/SKILL.md` (preload = always-on, others load-on-demand). Identity + tool-narrative lives in `packages/server/src/agents/patient.ts` `CORE`. Per-tool contracts live in each tool's `description` field. Server-only. |
| Admin agent behavior | Same pattern — cross-cutting in `.skills/`, identity in `agents/admin.ts` `CORE`, per-tool in `tools/admin/*` descriptions. New tool: `defineTool` (set `category`; writes/external auto-require approval), then register in `tools/admin/index.ts`. |
| Clinical behaviour skill | Edit `.skills/<name>/SKILL.md`; run `npm run skills:bundle` (or just `npm run typecheck` — the `pretypecheck` hook bundles for you). PR routing follows the skill's `owner` frontmatter. |
| Triage rules | `packages/server/src/tools/patient/run_triage.ts` — deterministic, no ML. |
| Model tiers / IDs | `packages/server/src/models.ts` — single source. |
| D1 schema | Add a `migrations/000N_*.sql`; apply with `npm run db:migrate:remote`. Update `@drkyana/types`. |
| Admin management UI | `apps/admin/app/**` — pages + `app/api/*` route handlers, all wrapped with `withAccess`. |
| Knowledge base | Curated via the admin `/kb` page → `kb/ingest.ts` chunks + embeds → Vectorize. |
| Patient marketing copy / hero photo / QRs | Replace source in `assets/`, then `npm run images:optimize`. |

---

## How copy works

Every translatable string is referenced from a component via the i18n hook:

```tsx
const { t } = useTranslation();
return <h2>{t('section.title', 'Fallback English')}</h2>;
```

`<I18nProvider>` detects the user's language (`localStorage.drkyana.lang` → `navigator.language` → default English), fetches `public/locales/<lang>.yaml`, parses it with a tiny in-browser reader, and exposes the dictionary through React context. The fallback you pass to `t()` is what fa/bn users see for the brief moment between mount and the locale fetch resolving.

YAML format is intentionally conservative: one `key: "value"` per line, JSON-style double-quoted strings, optional `#` comments and blank lines for grouping. Don't introduce nested keys, anchors, or multi-line scalars — the browser-side parser (`src/i18n/parseYaml.ts`) and the Python linter (`scripts/locales.py`) both rely on this.

### Adding a translatable string

```bash
python scripts/locales.py add section.newkey \
    --en "English text" \
    --fa "متن فارسی" \
    --bn "বাংলা পাঠ্য"
```

Then reference it as `{t('section.newkey')}` and run `npm run locales:check`.

### Locale linter cheat sheet

```
python scripts/locales.py check              # validate everything (CI gate)
python scripts/locales.py keys               # canonical key list
python scripts/locales.py show KEY           # all three locales side by side
python scripts/locales.py add KEY --en .. --fa .. --bn ..
python scripts/locales.py rename OLD NEW
python scripts/locales.py remove KEY
python scripts/locales.py sort               # reorder fa/bn to match en (noisy)
```

`check` exits 1 on: missing/extra keys per locale, duplicates, unparseable lines, `t()` references in `src/` with no matching key. It warns on: empty values, `TODO:` stubs, and `en.yaml` keys with no `t()` consumer.

### RTL / Farsi caution

Persian is RTL. **Do not set `dir="rtl"` on `<html>`** — it flips every flex/grid in the layout. Keep `dir="ltr"` always; the Unicode bidi algorithm renders Farsi correctly inside `<p>` / `<h*>`. For per-paragraph alignment, use `html[lang="fa"] p { text-align: right }` in `src/index.css`.

---

## Updating images

Source images live in `assets/` (high-res originals). `scripts/optimize_images.py` reads from `assets/` and writes web-ready versions into `public/assets/` — those are what the React components import.

```bash
python scripts/optimize_images.py            # rebuilds everything
python scripts/optimize_images.py --check    # CI gate: exits 1 if outputs are stale
```

| Source | Output | What the optimizer does |
|---|---|---|
| `assets/photo.jpg` | `public/assets/photo.jpg` | Resize to 1024 px wide, q82 progressive JPEG |
| `assets/insta-qr.png` | `public/assets/insta-qr.png` | Re-encode as optimised PNG. No resize — the `@drkyana` handle stays pixel-exact |
| `assets/whatsapp-qr.jpg` | `public/assets/whatsapp-qr.png` | Auto-crop the caption band, resize to 360 px, PNG |

Both source and optimised files are committed.

---

## Provisioning (Cloudflare)

Resources already created on the account: D1 `drkyana`, KV `drkyana` (bind as `KV`), Vectorize `drkyana-kb` (1024-dim cosine), R2 `drkyana-media`. See `wrangler.example.toml` for the canonical bindings + IDs.

Still required before end-to-end runtime:

- **Patient Pages project `drkyana`** — bindings must be named **`DB`, `KV`** (code reads those) + secrets `ANTHROPIC_API_KEY`, `IP_HASH_SALT`, and (for urgent-notify) the `EMAIL` send binding + `RECEPTIONIST_FROM` / `DR_KYANA_NOTIFY_EMAIL` vars. The patient `/api/agent/patient` endpoint is currently public (no token gate — a client-bundled token gave no real protection); abuse is controlled by the per-IP KV rate limit. Add Cloudflare Turnstile if stronger protection is needed.
- **Admin worker `drkyana-admin`** — paste resource IDs into `apps/admin/wrangler.jsonc`; add the **Workers AI (`AI`)** binding; set `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD`; put Cloudflare Access in front.
- **Email Service** — onboard `drkyana.com` for Email Sending (SPF/DKIM on `cf-bounce.drkyana.com` — root MX stays with GoDaddy). Known runtime risk: `packages/server/src/email.ts` calls `EMAIL.send({from,to,raw})`; validate against the `cloudflare:email` `EmailMessage` API when onboarding.
- **Scheduled reminders** — logic is in `scheduled/reminders.ts`, reachable via `POST /api/cron/reminders`, but OpenNext exposes no `scheduled()` hook — wire a small separate cron Worker (or external scheduler) to call it.
- **Anthropic BAA** before any real patient PHI. Test with synthetic patients until then.

---

## Deployment

- **Patient SPA** — Cloudflare Pages project `drkyana`. Builds the root Vite SPA; `functions/` are its Pages Functions. Push to `main` triggers the build via `.github/workflows/deploy.yml`.
- **Admin Worker** — `cd apps/admin && npm run build` produces an OpenNext bundle that `wrangler deploy` ships as Worker `drkyana-admin`.
- **Migrations** — `npm run db:migrate:remote` applies SQL to the deployed D1. Re-runnable migrations only; the file name is the contract.

If a deploy fails, the previous build stays live.

---

## Core guardrail

The agent **drafts; the licensed dentist reviews, sends, and decides.** Nothing clinical is autonomous. Write and external tools are gated by AI SDK 6 `needsApproval`. The agent never issues a definitive diagnosis and never invents clinical facts. See `CLAUDE.md` for the longer version of this rule and the deliberately-out-of-scope list (inbound email parsing, autonomous clinical decisions, Google Sheets / AppSheet, heavy durable-execution).
