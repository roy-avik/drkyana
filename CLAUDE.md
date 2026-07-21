# Dr Kyana — Clinical Agent Platform

Promotional site **and** clinical agent platform for Dr Kyana, a dental surgeon consulting at chambers across Dhaka on a freelance basis (no single fixed clinic — appointment locations are confirmed per patient). Two front ends share one server-side tool layer:

1. **Patient site + AI receptionist** (public) — the marketing SPA with an inline AI receptionist that conducts a dental intake and persists it. Intent classification runs server-side via a Claude agent; on a booking/urgent intent the agent calls **`collect_intake`** (a client-rendered tool) and the receptionist renders the **structured intake form** in one step — no slot-by-slot Q&A, big cut in Claude calls. (The old on-device Transformers.js classifier was removed — too heavy a download.)
2. **Admin practice console** (private, behind Cloudflare Access) — Dr Kyana's management surface (intake queue, status workflow, chamber editing, draft review) **plus** an agent that drafts clinical documents, reads X-rays, researches conditions, and sends email. This **replaces Google Sheets + AppSheet** — the platform now owns its own database.

Brand voice: calm, considered, modern. Tagline **"Modern dentistry. Considered care."** Don't reintroduce "fresh graduate" framing.

**Core guardrail (everywhere):** the agent **drafts; the licensed dentist reviews, sends, and decides.** Nothing clinical is autonomous. Write/external tools are gated by AI SDK 6 `needsApproval`. The agent never issues a definitive diagnosis and never invents clinical facts.

## Languages & audience

Three-language i18n (English / Persian-Farsi / Bengali) on the patient site via runtime-fetched YAML. The receptionist agent replies in the patient's language (EN/BN/FA). Reflects that Dr Kyana is Iranian practicing in Bangladesh; most patients write Bengali.

## Architecture

Cloudflare-native, Anthropic-only (Claude + vision). npm-workspaces monorepo.

```
PATIENT (public)                          ADMIN (Cloudflare Access)
 root Vite SPA (src/, functions/)          apps/admin — Next.js 16 PWA (OpenNext + Serwist)
  - marketing site + receptionist           - intake queue, status, chamber CRUD, draft review,
  - useChat -> POST /api/agent/patient        KB curation, agent chat (useChat)
  - NO agent code/prompts in bundle         - NO prompts/secrets in client bundle
        │                                          │
        ▼ functions/api/agent/patient.ts           ▼ app/api/agent/admin/route.ts (+ mgmt/kb/jobs APIs)
 ┌──────────────────────────────────────────────────────────────────┐
 │ packages/server  (server-only: ALL prompts + tool impls live here)│
 │  AI SDK 6 agent loop (Claude) · patient + admin agents · radiology │
 │  subagent (vision) · job runner -> KV · email helper · KB ingest   │
 └───┬─────────────┬──────────────┬──────────────┬───────────────────┘
     ▼             ▼              ▼              ▼            ▼
   D1            KV           Vectorize         R2          Email Service
 (system of    (chat        (drkyana-kb,     (images,    (send as
  record)       sessions,    1024-dim KB)     PDFs)       care@drkyana.com)
                job results,
                rate limits)
```

- **Hosting:** Cloudflare. Patient = Pages (project `drkyana`, builds the root Vite SPA, `functions/` are its Pages Functions). Admin = a Worker via `@opennextjs/cloudflare` (`drkyana-admin`).
- **Provider:** Anthropic-only. Tiers in `packages/server/src/models.ts`: `cheap`=Haiku (intake, routing), `standard`=Sonnet (admin chat, drafting), `vision`=Sonnet (radiology). Embeddings come from **Workers AI** (`@cf/baai/bge-m3`, 1024-dim) — Anthropic has no embeddings API.
- **Data:** **D1** (`drkyana`) is the sole system of record — tables `patients` (longitudinal record), `intakes`, `chambers`, `drafts`, `kb_docs`, `sessions` (see `migrations/0001_init.sql`). **KV** for chat sessions, job results (`job:{id}`), and rate-limit counters. **Vectorize** (`drkyana-kb`) for the RAG knowledge base. **R2** (`drkyana-media`) for X-ray images + generated PDFs.
- **No Google Sheets / AppSheet. No on-device ML.** Both removed.

## Repo layout

```
index.html, vite.config.ts          # Patient SPA (Vite + React 19 + Tailwind v4).
src/                                 # Patient marketing site + receptionist UI.
  components/Receptionist.tsx        #   useChat chat against /api/agent/patient.
  i18n/, components/, index.css
public/locales/{en,fa,bn}.yaml       # Patient copy (conservative YAML — see i18n note).
functions/api/agent/patient.ts       # Patient Pages Function: KV rate limit
                                     #   + D1 session + streamAgent(patient).
migrations/0001_init.sql             # D1 schema (the sole data store).
scripts/
  locales.py                         # i18n linter/manager (stdlib-only).
  optimize_images.py                 # Build public/assets/* from assets/*.
  check-isolation.mjs                # Fails build if server-only code leaks to a client bundle.

packages/
  types/                             # Shared TYPES ONLY (no prompts/tool bodies). @drkyana/types.
  server/                            # @drkyana/server — server-only. ALL prompts + tools.
    src/agents.ts                    #   AgentSpec, streamAgent/runAgent, prepareStep escalation.
    src/agents/{patient,admin,radiology}.ts
    src/tools.ts                     #   defineTool / ToolSpec (category read|write|external,
                                     #   needsApproval), toAiSdkTools.
    src/tools/patient/*              #   collect_intake (client-rendered form),
                                     #     run_triage, suggest_chamber, lookup_returning_patient,
                                     #     submit_intake (fires urgent-notify email).
    src/tools/admin/*                #   list_intakes, get_intake, get/update_patient_memory,
                                     #     kb_search, draft_* , update_status, upsert_chamber,
                                     #     send_receptionist_email, start_radiology_analysis,
                                     #     compile_pdf.
    src/context.ts                   #   AgentContext, assertAdmin/assertOwnPatient.
    src/mcp/                         #   Admin views as MCP Apps: views.ts (View-DSL
                                     #     builders), template.ts (ui:// app, DLS-styled),
                                     #     tools.ts (open_* view tools + ui_* app-only),
                                     #     server.ts (stateless Streamable-HTTP MCP).
    src/models.ts, bindings.ts (Env), jobs.ts, embeddings.ts, email.ts
    src/kb/ingest.ts, src/pdf/render.ts, src/scheduled/reminders.ts

apps/admin/                          # Next.js 16 PWA (OpenNext/Cloudflare), Cloudflare Access.
  app/                               #   pages + api routes (intakes, chambers, drafts, kb,
                                     #     jobs, agent/admin, cron/reminders, mcp,
                                     #     views/action).
  app/components/ViewRenderer.tsx    #   in-app View-DSL renderer (assistant chat).
  server/access.ts                   #   CF Access JWT verification (withAccess).
  server/db.ts                       #   parameterized D1 access for mgmt routes.
  wrangler.jsonc                     #   bindings DB/KV/VECTORIZE/R2/AI/EMAIL.

wrangler.example.toml                # Canonical bindings reference + provisioning commands.
```

## Agent loops & tool calling (the heart of it)

- Agents are `AgentSpec`s (`packages/server/src/agents.ts`) run via `streamAgent` (interactive chat, `toUIMessageStreamResponse`) or `runAgent` (background, non-streamed). `stopWhen: stepCountIs(maxSteps)`; `escalate` → `prepareStep` swaps the model tier per step (e.g. radiology step → `vision`).
- **Tools are the only data gateway.** The model never sees bindings/credentials/SQL — it calls a `defineTool` whose Zod `inputSchema` is validated before `execute(args, ctx)` runs server-side. Authorize via `ctx` (`assertAdmin` / `assertOwnPatient`), **never** from model args. Return compact results (PHI/token hygiene).
- **Approval gates:** `category: 'write' | 'external'` ⇒ `needsApproval` ⇒ AI SDK 6 pauses for Dr Kyana's approve/edit before executing. This is "agent drafts, dentist sends," enforced by the framework.
- **Long jobs don't stream:** `start_radiology_analysis` / `compile_pdf` enqueue via `createJobRunner` (`jobs.ts`) → write `job:{id}` to KV via `ctx.waitUntil` → admin UI polls `GET /api/jobs/:id`.
- **Patient memory:** `patients.summary` (LLM narrative) + `patients.memory` (structured JSON). `update_patient_memory` merges structured facts **deterministically** (union/dedupe) and uses the LLM **only** to recompose the narrative — never to invent facts. Approval-gated.
- **Cross-session activity log:** every successful ADMIN write — from the in-app agent loop, an MCP host (Claude/ChatGPT apps), or a click inside a rendered view — is recorded in D1 `admin_actions` (migration 0007) via `recordAdminAction` (`src/audit.ts`; detail is PHI-lean: ids/statuses only, never bodies). Read back through the `get_recent_activity` tool and the `open_activity` view, so any session can see what happened in the others.
- **Interactive admin views (MCP Apps + agent loop):** the admin views are declarative **View-DSL documents** (`@drkyana/types` `view-dsl.ts`, spec `docs/view-dsl.md`) built server-side in `packages/server/src/mcp/views.ts` and styled by the **DLS** design-token system (`@drkyana/types` `dls.ts`, spec `docs/dls.md`). `open_*` view tools return `{ summary, view }` — the model sees only the summary (`modelSummary` → `toModelOutput`); the client renders the doc. Two render paths: (a) agent hosts connect to **`POST /api/mcp`** (stateless Streamable-HTTP MCP behind CF Access) and render `ui://drkyana/admin-view.html` per the MCP Apps extension (`io.modelcontextprotocol/ui`); (b) the in-app assistant chat renders via `ViewRenderer.tsx`, executing actions through `POST /api/views/action` (closed `viewActionTools` registry). View actions are clicks by the signed-in dentist — the click **is** the approval, so `ui_*` app-only tools set `needsApproval: false` and are listed over MCP with `visibility: ["app"]` (hidden from the model).

## Code isolation (hard rule)

Patient and admin are separate builds; **prompts + tool implementations live only in `packages/server` (server-only)** and must never be imported into a client bundle. `scripts/check-isolation.mjs` (run in CI and locally, incl. `--dist`) fails the build on a leak. Shared client code is limited to `@drkyana/types` (types only). The patient browser just POSTs messages and renders the stream.

## How to update

| Change | What to do |
|---|---|
| Patient copy | Edit the key in **every** `public/locales/*.yaml`, then `python3 scripts/locales.py check`. Reference via `t('foo.bar','fallback')`. |
| Patient receptionist behavior | Edit the agent prompt/tools in `packages/server/src/agents/patient.ts` + `tools/patient/*`. Server-only. |
| Admin agent behavior | `packages/server/src/agents/admin.ts` + `tools/admin/*`. New tool: `defineTool` (set `category`; writes/external auto-require approval), add to `tools/admin/index.ts`. |
| Triage rules | `packages/server/src/tools/patient/run_triage.ts` (deterministic, no ML). |
| Model tiers / IDs | `packages/server/src/models.ts` (single source). |
| D1 schema | add a `migrations/000N_*.sql` (next number, `IF NOT EXISTS`-friendly) + update `@drkyana/types`. **Migrations auto-apply on deploy**: the Pages production build runs `npm run cf:build` → `scripts/migrate.mjs` applies pending migrations to remote D1 *before* publishing (tracked in `applied_migrations`, prod-branch only). No manual step. To apply by hand: `npm run db:migrate:remote`. |
| Admin management UI | `apps/admin/app/**` (pages + `app/api/*` route handlers, all `withAccess`). |
| Interactive admin views | Builder in `packages/server/src/mcp/views.ts` + view tool in `src/mcp/tools.ts` (add to `viewTools`). Both renderers + MCP pick it up automatically. Spec: `docs/view-dsl.md`. |
| Design language (DLS) | Tokens in `packages/types/src/dls.ts` (+ `docs/dls.md`). Never hard-code colors/sizes in a renderer. |
| Knowledge base | Dr Kyana curates via the admin `/kb` page → `kb/ingest.ts` chunks+embeds→Vectorize. |
| Hero photo / QRs | replace source in `assets/`, run `python3 scripts/optimize_images.py`. |

## Local development

```
npm install
npm run dev            # patient SPA (vite), http://localhost:5173/
npm run build          # patient build -> dist/
cd apps/admin && npm run dev     # admin (next dev)
cd apps/admin && npm run build   # admin (next build --webpack — Serwist needs webpack)
npx tsc -p packages/server/tsconfig.json   # server typecheck
node scripts/check-isolation.mjs [--dist]  # isolation guard
python3 scripts/locales.py check
npm run db:migrate:local | :remote         # apply migrations
```

Python deps: `pip install "pillow==12.3.0"` (image script only; pinned — see the CI note).

## Provisioning (Cloudflare account)

Resources (created): D1 `drkyana`, KV `drkyana` (bind as `KV`), Vectorize `drkyana-kb` (1024-dim cosine), R2 `drkyana-media`. See `wrangler.example.toml` for the canonical bindings + IDs.

**Still required before end-to-end runtime:**
- **Patient Pages project `drkyana`** bindings must be named **`DB`, `KV`** (code reads those) + secrets `ANTHROPIC_API_KEY`, `IP_HASH_SALT`, and (for urgent-notify) the `EMAIL` send binding + `RECEPTIONIST_FROM`/`DR_KYANA_NOTIFY_EMAIL` vars. The patient `/api/agent/patient` endpoint is **public** (no token gate — a client-bundled token gave no real protection); abuse is controlled by the per-IP KV rate limit. Add Cloudflare Turnstile if stronger protection is needed.
- **Auto-migrations on deploy** (so schema never lags code): set the Pages project **Build command** to `npm run cf:build` (not `npm run build`), and add build-time **environment variables** `CLOUDFLARE_API_TOKEN` (a token with *D1 Edit* on this account) + `CLOUDFLARE_ACCOUNT_ID`. The build then runs `scripts/migrate.mjs` (prod branch only) to apply pending `migrations/*.sql` to remote D1 before publishing. Without the token the build fails loudly (by design — don't publish code whose schema didn't apply). First prod build auto-adopts the existing schema (records 0001–0006 as applied without re-running).
- **Admin worker `drkyana-admin`**: paste resource IDs into `apps/admin/wrangler.jsonc`; add the **Workers AI (`AI`)** binding; set `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`; put Cloudflare Access in front.
- **MCP connectors (Claude/ChatGPT apps, incl. iOS)**: `/api/mcp` speaks MCP OAuth (DCR + PKCE; sign-in federates to the Access SSO at `/oauth/authorize`). Requires a path-scoped Access **Bypass** app for `/.well-known/*`, `/api/oauth/register`, `/api/oauth/token`, `/api/mcp` (the Worker enforces bearer/Access auth itself). Setup + revocation: `docs/connect-agents.md`.
- **Email Service**: onboard `drkyana.com` for Email Sending (SPF/DKIM on `cf-bounce.drkyana.com` — root MX stays with GoDaddy). **Known runtime risk:** `packages/server/src/email.ts` calls `EMAIL.send({from,to,raw})`; validate against the `cloudflare:email` `EmailMessage` API when onboarding.
- **Scheduled reminders**: logic is in `scheduled/reminders.ts`, reachable via `POST /api/cron/reminders`, but OpenNext exposes no `scheduled()` hook — wire a small separate cron Worker (or external scheduler) to call it.
- **Anthropic BAA** before any real patient PHI. Test with synthetic patients until then.

## RTL / Farsi caution (patient site)

Persian is RTL. **Do not set `dir="rtl"` on `<html>`** — it flips every flex/grid. Keep `dir="ltr"` always; the Unicode bidi algorithm renders Farsi correctly inside `<p>`/`<h*>`. For per-paragraph alignment use `html[lang="fa"] p { text-align: right }` in `src/index.css`.

## Brand & content references

- **Practitioner:** Dr Kyana (English handle `@drkyana`; Persian کیانا / Bengali কিয়ানা). First name only.
- **Email:** `kyanalotfi96@gmail.com` (personal/notify) and `care@drkyana.com` (clinic, GoDaddy-hosted; the agent *sends* as this via Cloudflare Email Service).
- **Instagram:** [@drkyana](https://instagram.com/drkyana)
- **WhatsApp:** Dr Kyana's number is **not published on the patient site** (personal number; public exposure invites contact outside any consent, record, or audit trail). It is held as the `DR_KYANA_WHATSAPP` Worker secret for the future admin-initiated escalation flow, and `scripts/check-isolation.mjs` fails the build if it appears in a client bundle.
- **Practice model:** freelance across multiple Dhaka chambers; location set per booking; no fixed address.
- **Brand color** `#0f4c81`, accent `#3b82f6`, ink `#0f172a`, muted `#475569`, surfaces `#ffffff`/`#f8fafc` (Tailwind `@theme` in `src/index.css`).
- **Typography:** Poppins (Latin), Vazirmatn (Persian), Noto Sans Bengali.

## Out of scope (don't pull in without asking)

- **Inbound email parsing** — v1 is send-only; replies land in the GoDaddy mailbox.
- **Autonomous clinical decisions** — the agent only drafts; the dentist confirms. Never bypass approval gates; never assert a diagnosis.
- **Re-introducing Google Sheets / AppSheet / on-device ML** — deliberately removed.
- **Inngest / heavy durable-execution** — long jobs use KV + polling; add Inngest only if jobs outgrow that.

## Deferred

- **Radiology regulatory sign-off** (Bangladesh) + R2 image **retention policy** + **Anthropic BAA** — required before real PHI / imaging.
- **Cron Worker** for scheduled reminders (logic exists; needs a scheduled-handler host).
- **Farsi receptionist tuning** — the agent handles FA, but examples/eval are EN+BN-weighted.
- **Email `EmailMessage` API validation** during Email Service onboarding.

## Dependency advisories

Run `npm audit` before adding/upgrading packages. Current known item (accepted, low risk):

- **`GHSA-qx2v-qp2m-jg93`** — `postcss <8.5.10` XSS via unescaped `</style>` in CSS **stringify** output. Pulled in only as **Next.js's exact-pinned `postcss@8.4.31`** (`node_modules/next/node_modules/postcss`). **Build-time only and not runtime-exploitable here** — postcss processes our own trusted CSS during `next build`, never attacker-controlled input. **Do NOT `npm audit fix --force`** (it downgrades Next.js to 9.x). An npm `overrides` pin can't displace Next's exact pin, and a full lock regen to chase it churns unvetted transitives. Resolves when Next ships a patched postcss — re-check `npm audit` after each Next upgrade.
