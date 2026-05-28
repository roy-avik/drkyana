# Dr Kyana clinical agent platform — Cloudflare-native, own database, Claude

## Context

Grew from "should the receptionist call an LLM?" into a full clinical agent platform that **replaces Google Sheets + AppSheet** with our own database and admin app. Locked decisions:

| Area | Decision |
|---|---|
| Provider | **Anthropic-only** — Claude for text/Bengali/long-context, Claude **vision** for imaging |
| Agent runtime | **Vercel AI SDK 6** (server-side multi-step tool loops, `Agent` class, `useChat`; **native `needsApproval` HITL** enforces "agent drafts, dentist sends") |
| Hosting | **Cloudflare** (Workers/Pages). Admin = **Next.js via OpenNext** (PWA, Serwist). Patient marketing/receptionist = existing **Vite SPA** (trimmed) |
| Primary DB | **Cloudflare D1** (relational — sole system of record; powers the management console's queries) |
| NoSQL layer | **Workers KV** — long-job results/status, caches, rate-limit counters |
| Vector KB | **Cloudflare Vectorize** (embeddings, RAG), human-co-curated |
| ~~Google Sheets / AppSheet~~ | **REMOVED.** Admin PWA is now Dr Kyana's management surface |
| On-device ML | **REMOVED** — Transformers.js MiniLM, R2 model proxy + cron, Cache Storage preload all retired. Intent classification is now **server-side** in the Claude agent |
| Email | **`receptionist@drkyana.com`** via CF Email Service `send_email` binding (sends on `cf-bounce` subdomain — no conflict with GoDaddy mailbox). **Send-only** v1 |
| Long jobs | Background → **write result to KV** → admin UI **polls**. No streaming, no Inngest |
| Front ends | **Two, hard-isolated**: patient receptionist + Dr Kyana admin console |
| Guardrail | **Agent drafts; the licensed dentist reviews/sends/acts.** Nothing clinical is autonomous |

### Scope override (rewrite CLAUDE.md before merge)

This overrides CLAUDE.md's "Out of scope" lines (in-browser patient management; generative responses), the entire on-device classifier architecture, **and** the "Google Sheets is the sole data store / don't build a dashboard" stance. User has explicitly chosen all of this.

## Why D1 primary + KV (the requested fit analysis)

As the **sole** store powering a management console, the data needs relational **queries**: filter intakes by status/triage/date, "today's / this week's urgent," chamber joins, simple reporting. Relational (D1) serves these directly; KV/NoSQL would force hand-rolled secondary indexes and still can't sort/filter. So **D1 is the right primary**. KV is added only where key-value is genuinely the better tool: async job results, caches, counters. Durable Objects considered and **not** needed for v1 (no strong per-entity coordination requirement).

**Cost (one-dentist volume):** D1 ≈ $0 (≪ 25B reads / 50M writes / 5GB included). KV ≈ $0 (≪ included reads/writes). Vectorize ≈ $0 (≪ 10M stored + 50M queried dims). All inside the $5 Workers Paid plan.

## Whole-architecture cost (~30 intakes/mo + modest admin use)

| Component | Monthly |
|---|---|
| Workers Paid (covers Next.js/OpenNext compute, D1, KV, Vectorize, Email within included tiers) | $5 |
| D1 + KV + Vectorize | ~$0 |
| Email Service (3,000/mo included) | $0 |
| R2 (X-ray images + PDFs, few GB, no egress) | ~$0–1 |
| **Anthropic API (variable — dominated by radiology vision + deep research)** | **~$5–30** |
| **Total** | **~$10–40/mo** |

Headline unchanged: **CF infra is flat (~$6/mo); cost scales with Anthropic on the vision/research path.** Cheap text (intake classify, drafts) runs on Haiku for cents.

## Architecture

```
 PATIENT APP (public, Vite SPA, tiny)     ADMIN APP (Next.js PWA, CF Access-gated)
 ┌──────────────────────────┐            ┌──────────────────────────────────┐
 │ Receptionist UI          │            │ Mgmt surface (was AppSheet):      │
 │ NO agent code/prompts.   │            │ intake list/detail, status flow,  │
 │ POSTs messages only.     │            │ chamber CRUD, draft review/send,  │
 │                          │            │ + agent chat (useChat). NO secrets│
 └────────────┬─────────────┘            └──────────────┬────────────────────┘
              │ /api/agent/patient                      │ /api/agent/admin (+ mgmt APIs)
              ▼                                          ▼
 ┌──────────────────────────────────────────────────────────────────────────┐
 │ Server (Next.js route handlers/server actions on Workers via OpenNext)     │
 │  ALL prompts + tool impls server-only. AI SDK agent loop (Claude).         │
 │  Patient toolset (small) | Admin toolset (full + radiology subagent)       │
 │  send_email binding | Cron Triggers | Markdown→PDF | background jobs→KV     │
 └───┬───────────────┬───────────────┬───────────────┬──────────────────────┘
     ▼               ▼               ▼               ▼
   D1             KV              Vectorize          R2
 (intakes,     (job results,    (KB embeddings)   (X-ray images,
  chambers,     cache,                              generated PDFs)
  status,       counters)
  drafts)
```

The existing **R2 model-proxy Worker + cron and all Apps Script are retired.**

## Code isolation (hard requirement)

- **Separate builds** for patient (Vite SPA) vs admin (Next.js) — never a shared client bundle.
- **All prompts + tool implementations are server-only** (route handlers / server modules), never imported client-side. Next.js's server/client split + `import 'server-only'` guards enforce this; a lint rule fails the build if server-only modules leak into client components. Patient browser holds zero agent logic.
- Shared code limited to a **types-only package** (no prompts/tool bodies).
- Admin behind **Cloudflare Access** (Dr Kyana → Google sign-in; server verifies Access JWT). Patient route token-gated + KV-counter rate-limited.

## Data model (D1)

- **`patients`** (longitudinal record — the core of management & diagnosis support): `id`, `phone` (unique match key), `name`, `age/dob`, `gender`, `email`, `summary` (TEXT — maintained narrative of the patient's history), `memory` (JSON — structured facts: `conditions[]`, `allergies[]`, `medications[]`, `dental_history`, `anxiety`, `recurring_complaints[]`, `flags[]`), `last_visit`, `visit_count`, timestamps.
- **`intakes`** (one per visit, FK → `patients.id`): identity snapshot, complaint, history, logistics, triage level, status, timestamps.
- **`chambers`** (area, schedule, services, active), **`drafts`** (type, markdown, linked intake/patient, PDF R2 key, sent?), **`kb_docs`** (registry mirroring Vectorize), **`sessions`** (chat state).
- **KV**: `job:{id}` (status+result), caches, `rate:{ip}`.

### Patient memory & longitudinal record

A returning patient is matched by phone and their `summary` + `memory` are loaded into the agent's context for continuity ("recurring lower-left pain, penicillin allergy, high anxiety, last seen Mar 2026"). After each visit the record is updated:
- **Structured facts come from the structured intake, never invented by the LLM.** Allergies, meds, conditions, etc. are merged directly from the intake fields into `memory` (dedupe/normalize only).
- **The LLM only composes the narrative `summary`** and flags patterns across visits — as *decision support*, with the underlying intakes as sources. It does not assert new clinical facts.
- Agent-written changes to a patient's clinical `memory` carry **`needsApproval`** — it's Dr Kyana's record; she can edit/correct it in the console.
- This sharpens drafts: `draft_clinical_note`, the `radiology` subagent, and `draft_referral` all read patient memory so history informs the draft (still draft-and-verify, never autonomous diagnosis).

## Patient receptionist (post on-device removal)

Tiny Vite bundle, no Transformers.js. Patient types → POST `/api/agent/patient` → Claude (Haiku) does **server-side intent classification + slot extraction** → if the phone matches an existing `patients` row, prior `summary`/`memory` give continuity → writes structured intake to **D1** (linked to the patient) → on insert, server runs triage and updates the patient record (structured facts merged + summary regenerated, queued for Dr Kyana's approval); RED/ORANGE fires an email to Dr Kyana via `send_email` + a PWA push/notification.
- **Privacy:** "nothing leaves device until submit" is gone; every message hits Claude. Consent gate must say so and name Anthropic.
- Patient toolset: `suggest_chamber`, `run_triage`, `lookup_returning_patient` (own record), `submit_intake`.

## Admin app — management + agent (drafts only; dentist reviews)

**Management surface (replacing AppSheet):** intake list with filters (status/triage/date), intake detail, status workflow, chamber CRUD, urgent queue, draft review/edit/send. Installable PWA so it works as her phone app.

**Agent tools / Skills:**

| Skill / tool | Does | Runs as |
|---|---|---|
| `draft_aftercare(condition, lang)` | 6th-grade Bengali/English post-treatment instructions | sync |
| `draft_clinical_note(intake_id)` | SOAP-style dental note from a D1 intake | sync |
| **`radiology` subagent** | **Vision + research:** reads uploaded X-ray/CBCT/intraoral image, researches vs KB, compiles *draft observations* | **background job → KV; UI polls** |
| `compile_pdf(markdown, type)` | Co-curated markdown → PDF (prescription/aftercare/certificate) → R2, link stored | **background job → KV** |
| `send_receptionist_email(to, subject, body)` | Sends as `receptionist@drkyana.com` | sync / scheduled / event |
| `kb_search(query)` | RAG over Vectorize; cites sources | sync |
| `get_patient_memory(patientId)` | Read longitudinal summary + structured memory for continuity | sync (D1) |
| `update_patient_memory(patientId, facts)` | Merge structured facts from a visit + regenerate narrative summary | **`needsApproval`** |
| ops tools | `list_intakes(filter)`, `get_intake`, `update_status`, `upsert_chamber`, `draft_referral`, `draft_certificate`, `draft_followup` | sync (D1) |

Interactive admin chat streams via `useChat`; only long jobs go async-to-KV.

## Agent loops & tool calling (design detail)

**The loop.** Each agent is an AI SDK 6 `Agent` (thin wrapper over `streamText`/`generateText`) with a server-only `system` prompt, a `tools` map, and `stopWhen: stepCountIs(N)` to bound it. Mechanics: model emits tool calls → the SDK runs each tool's `execute()` **server-side** → results are appended to the message history → the model is re-invoked → repeat until it returns a final answer or hits the step cap. Three loops:
- **Patient agent** — small toolset, `stepCountIs(~5)`, Haiku, streamed via `toUIMessageStreamResponse()`.
- **Admin agent** — full toolset, larger step budget, streamed; long-running tools dispatch background jobs rather than blocking.
- **Radiology subagent** — its *own* `generateText` loop (vision read → `kb_search` → synthesize), run inside a background job, **not** streamed.

`prepareStep` escalates per step: cheap classification/extraction steps run Haiku; the radiology reasoning step swaps to a stronger Claude tier. Keeps the cost on the expensive path only.

**Tools are the only data gateway.** Tools are how the model touches anything server-side; the model never sees a binding, credential, or raw SQL — it only calls a named tool with Zod-validated args:
```ts
tool({
  description: "List intakes filtered by status/triage/date.",
  inputSchema: z.object({ status: z.enum([...]).optional(), triage: z.array(...).optional(), since: z.string().optional() }),
  execute: async (args, { abortSignal }) => {
    assertAdmin(ctx);                       // authz INSIDE the tool, from verified Access JWT (not model args)
    const rows = await ctx.db.prepare(SQL)  // parameterized D1 query
      .bind(...safe(args)).all();
    return rows.results.map(slim);          // return COMPACT fields — results re-enter context each step
  },
})
```
- **Reads** (D1 `SELECT`, `kb_search` over Vectorize with citations, `get_intake`) execute immediately and return trimmed rows.
- **Writes / external actions** (`update_status`, `send_receptionist_email`, finalize-and-send PDF) carry **`needsApproval: true`** → the SDK pauses the loop, the admin UI renders an approve/edit card, and `execute()` only runs on confirmation. This is the guardrail, enforced by the framework.
- **Authorization lives inside each tool**, derived from server context (patient tools scoped to the caller's own record via the session; admin tools require a verified Access JWT) — never from model-supplied arguments.
- **Safety:** Zod rejects malformed calls; all SQL parameterized; tool results kept compact to control token cost and avoid leaking unneeded PHI back into context.

**Long-job dispatch (no streaming).** A long tool returns fast and hands off:
```
admin agent calls start_radiology_analysis({imageKey})
  → tool writes job:{id}=pending to KV, schedules processing (waitUntil/Queue), returns {jobId}
  → agent tells the user "analysis started"
background runner = radiology subagent loop → writes job:{id}={done, draftMarkdown, citations} to KV
admin UI polls GET /api/jobs/:id → renders draft when ready → human edits → compile_pdf (another job) → R2
```

**Session & context.** Conversation persisted per session in D1 (`sessions`), reloaded each turn; a trim/summarize step caps tokens on long admin sessions (the SDK doesn't auto-compact). `abortSignal` honored for cancel; transient model errors retried with backoff; tool failures returned as structured results the model can recover from.

**Isolation.** Tool *implementations* + system prompts are server-only. The stream surfaces tool **names/args/states** (not secrets) so the UI can show progress — acceptable; if maximal opacity is wanted, map internal tool names to opaque labels at the stream boundary.

## Email integration

- **Send:** `send_email` binding; domain onboarded to Email Service; SPF/DKIM on `cf-bounce.drkyana.com`; GoDaddy mailbox (root MX) untouched.
- **Triggers:** scheduled (Cron Triggers — appointment reminders, follow-ups), background events (urgent intake → notify Dr Kyana), user-triggered (admin clicks "send" on a reviewed draft).
- **Receive:** out of scope v1 (replies land in GoDaddy mailbox).

## Radiology / vision — risk (load-bearing)

SaMD/regulatory territory. Output always *"draft observations for Dr Kyana to confirm,"* never autonomous diagnosis; prominent disclaimers; R2 images are a **PHI store** needing BAA coverage + retention policy; confirm Bangladesh regulatory + data-residency posture before shipping.

## Privacy / BAA

PHI now lives entirely in our CF stack (D1, KV, Vectorize, R2) and egresses to Claude per turn + per image. The `patients` table is a **longitudinal medical record** — the most sensitive store here. **Anthropic BAA required** before real PHI; all four stores must be covered; encrypt sensitive `patients` fields at rest where feasible; access-log reads of patient memory.

## Files / structure (monorepo)

- `apps/patient` — trim existing Vite SPA: remove `intentClassifier.ts`, `intents.ts`, on-device preload in `Receptionist.tsx`; repoint chat to `/api/agent/patient`.
- `apps/admin` — new Next.js PWA (OpenNext + Serwist), CF Access–gated; management UI + agent chat.
- `packages/server` (server-only) — AI SDK agents, prompts, tool impls, `send_email`, cron handlers, PDF render, D1/KV/Vectorize clients, background-job runner.
- `packages/types` — shared types only (no prompts/tool bodies).
- **D1 migrations** + **Vectorize index** + KB ingest script.
- **Retire** `worker/` model proxy + cron, `scripts/receptionist-webhook.gs`, all AppSheet/Sheets references.
- **CLAUDE.md** — full rewrite (architecture, data layer, on-device + Sheets removal, email, scope).

## Verification

1. Patient flow: message → server intent classify → intake written to **D1** → triage → urgent email/notification fires.
2. Bundle isolation: build both apps; grep client output — **zero** prompts/tool names/secrets/admin code.
3. Admin auth: `/api/agent/admin` + mgmt APIs reject unauthenticated requests.
4. Management surface: create/list/filter intakes, change status, edit a chamber — all persist to D1 and reflect in the UI.
4b. Patient memory: submit two intakes for the same phone → second visit loads prior summary/memory; structured facts (allergy/meds) merge from intake fields (not invented); summary regen queued for approval; Dr Kyana can edit the record.
5. Drafting: aftercare in Bengali (6th-grade, disclaimer, KB-cited); clinical note SOAP-structured.
6. Radiology: sample (non-real) X-ray → background job writes to KV → UI polls → *draft observations* + disclaimers, never a diagnosis.
7. PDF: generate → human-edit markdown → background render → R2 link in D1.
8. KB/RAG: seed curated docs → `kb_search` retrieves + cites.
9. Email: `send_email` delivers as `receptionist@drkyana.com`, SPF/DKIM pass; cron fires a scheduled reminder.
10. Cost check: Anthropic console after a day; vision/research is the dominant line.

## Execution & multi-agent orchestration

This plan is committed into the repo at **`docs/clinical-agent-platform.md`** as the first step (single source of truth for the build).

Greenfield with shared foundations → **sequential foundation, then parallel leaves, then reconverge.** Subagents are spawned only for Phase 1 leaves, each handed the fixed contracts from Phase 0 so they don't re-derive or diverge.

- **Phase 0 — foundation (sequential, no subagents).** Monorepo scaffold; `wrangler` bindings (D1/KV/Vectorize/R2/Email/Access); **D1 schema + migrations** (`patients`, `intakes`, `chambers`, `drafts`, `kb_docs`, `sessions`); `packages/types`; `packages/server` skeleton with the **agent-loop + tool-registry contract** and `needsApproval` plumbing; the **isolation lint guard**. Everything downstream depends on these.
- **Phase 1 — parallel leaves (one subagent each, contracts frozen):**
  - **A — Patient app:** trim Vite SPA (remove Transformers.js/intents), wire `/api/agent/patient` + patient toolset.
  - **B — Admin shell:** Next.js PWA (OpenNext + Serwist) + CF Access + management UI (intake list/filter/detail, status workflow, chamber CRUD).
  - **C — Admin agent capabilities:** drafting Skills, `kb_search`, patient-memory tools, radiology subagent + background job runner (→ KV) + poll endpoint.
  - **D — Email & KB:** `send_email` binding, Cron Triggers, urgent-notify; Vectorize index + KB ingest pipeline; markdown→PDF render.
- **Phase 2 — reconverge (sequential, no subagents).** Integration, retire old `worker/` proxy + Apps Script, run the full verification checklist, rewrite CLAUDE.md.

Trust-but-verify: each subagent's output is reviewed against the frozen contracts before integration.

## Open decisions (remaining — compliance/procurement, pending your further requirements)

1. **R2 image retention** policy (PHI).
2. **Regulatory sign-off** on vision radiograph interpretation in Bangladesh.
3. **Anthropic BAA** procurement before real PHI.
4. **Migration:** is there existing Sheets data to import into D1, or do we start clean?
