# LangGraph assessment — should Dr Kyana adopt it, and where?

**Status:** proposed · **Decision:** do not adopt wholesale; prefer native durability, revisit on multi-agent emergence · **Date:** 2026-07

## Context

The question raised was "how can we leverage LangGraph for our systems." This
document records the assessment and the decision, so the reasoning survives past
the conversation that produced it. It changes no runtime code, schema, or
dependencies.

Where we are today (one paragraph): patient and admin chat run on **Vercel AI SDK 6**
— a server-side multi-step tool loop (`streamText` / `generateText`,
`packages/server/src/agents.ts`) with **native human-in-the-loop** via `needsApproval`
on write/external tools (`packages/server/src/tools.ts`), **per-step model escalation**
via `prepareStep` (e.g. swap to the vision tier after `start_radiology_analysis`), and
**D1-backed session persistence** (`functions/api/agent/patient.ts`,
`apps/admin/app/api/agent/admin/route.ts`). Long jobs (radiology, PDF) don't stream:
they enqueue through `createJobRunner` (`packages/server/src/jobs.ts`) →
`ctx.waitUntil` runs the handler (`packages/server/src/jobs/handlers.ts`) → the result
lands in KV as `job:{id}` → the admin UI polls.

Three constraints bound any answer (all locked in `CLAUDE.md` and
`docs/clinical-agent-platform.md`):

| Constraint | Consequence for LangGraph |
|---|---|
| **Anthropic-only** | LangGraphJS pulls in the LangChain ecosystem — a large, provider-agnostic surface we've deliberately avoided |
| **Cloudflare Workers runtime** | Short isolate lifetime, no native durable queue; **no native Cloudflare checkpointer exists** for LangGraph — we'd build one over D1/KV |
| **"No Inngest / heavy durable-execution without asking"** (out of scope) | Any durable-orchestration framework is an explicit scope decision, not a drop-in |
| **Code isolation** (`scripts/check-isolation.mjs`) | Any new orchestration stays server-only in `packages/server`; never a client bundle |

## What LangGraph offers

LangGraph (`@langchain/langgraph`) models an agent as a **state graph**: nodes mutate
a shared typed state, edges (including **conditional** and **cyclic** ones) decide
routing. Its notable capabilities:

- **`interrupt()` / `Command`** — first-class human-in-the-loop pause/resume.
- **Checkpointers** — persist graph state after each node so a run can pause and
  **resume durably**, even in a later process/request.
- **Multi-agent supervisor / subgraphs** — explicit routing and delegation between
  specialised agents, with typed state reducers.
- **Streaming** of tokens and intermediate state.

## Map onto our system

The honest finding is that most of LangGraph's headline features map onto things we
**already** solve:

| LangGraph capability | How we solve it today | Verdict |
|---|---|---|
| `interrupt()` HITL | AI SDK 6 `needsApproval` pauses the loop for approve/edit (`tools.ts`) | **Already covered** |
| Conditional routing between tools | The model routes via tool calls; the loop is `stepCountIs(maxSteps)`-bounded | **Already covered** |
| Per-step model choice | `prepareStep` escalation callback (`agents.ts`) swaps tier per step | **Already covered** |
| Streaming to UI | `result.toUIMessageStreamResponse()` wired to `useChat` | **Already covered** |
| Session state across turns | D1 `sessions.messages`, merge-by-id, `onFinish` persist | **Already covered** |
| Checkpoint / durable resume of long work | `ctx.waitUntil` + KV polling — **not durable**; a dead isolate loses the run | **Real gap** |
| Multi-agent supervisor / subgraphs | Prompts + `escalate` callback + tool calls; radiology is a `runAgent` subagent inside a job | Adequate today; **not graph-shaped yet** |

Moving **chat** onto LangGraph would be a lateral move that also breaks the `useChat`
integration and adds the LangChain dependency for no capability we lack. That is not
worth doing.

## The one real gap: durable long-running work

`start_radiology_analysis` and `compile_pdf` return a `jobId` immediately, then do the
real work inside `ctx.waitUntil`. That promise lives only as long as the Workers
isolate. If the isolate is reclaimed mid-run (a long vision inference, a slow multi-step
research→draft→radiology→compile→review pipeline), **there is no durable checkpoint to
resume from** — the job is simply lost, and polling sees it stuck. This is the single
place where a checkpointed, resumable execution model earns its keep, and it's the real
substance behind "leverage LangGraph."

But LangGraph is not the only — or the best — way to close it on this stack.

## Options compared

| Criterion | (a) Status quo | (b) **Cloudflare Workflows / Durable Objects** | (c) LangGraphJS + custom D1 checkpointer |
|---|---|---|---|
| Fits Anthropic-only | ✅ | ✅ | ⚠️ pulls in LangChain |
| Fits Workers runtime | ✅ | ✅ **native** durable execution | ⚠️ no native checkpointer; build over D1/KV |
| Durable resume of long jobs | ❌ | ✅ | ✅ |
| Multi-agent graph topology | ❌ | ⚠️ code-shaped, not graph-shaped | ✅ strongest |
| New dependency weight | none | none (native binding) | high (LangChain core) |
| Conflicts with CLAUDE.md guardrails | none | **none** — native, no Inngest | ⚠️ "no heavy durable-execution / Anthropic-only" |
| Migration cost | none | moderate (wrap job handlers) | high (checkpointer + re-plumb) |

## Recommendation

**Do not adopt LangGraph wholesale, and do not move chat onto it.** Its strengths
overlap almost entirely with what AI SDK 6 already does well here, and its one genuine
differentiator — durable, graph-shaped orchestration — is better served on Cloudflare
by a native option. Concretely:

1. **Keep AI SDK 6 for all chat + simple jobs.** It owns HITL, escalation, streaming,
   and `useChat`. No payoff to replacing it.
2. **When durability is actually needed, prefer Cloudflare Workflows (or Durable
   Objects) over LangGraph.** *Trigger:* the first time a radiology run or a multi-step
   pipeline is observed to exceed the isolate lifetime, or we want retry/backoff and
   resume for a job. Workflows gives durable, resumable, retryable execution **natively**
   — no LangChain, no Anthropic-only conflict, no custom checkpointer — and slots in
   behind the existing `createJobRunner` seam without touching the tool/agent layer.
3. **Revisit LangGraph only if orchestration becomes genuinely graph-shaped.**
   *Trigger:* a real **multi-agent supervisor** need emerges — branching / parallel
   fan-out / cyclic delegation between admin, radiology, and research subagents that the
   `escalate` callback + tool calls can no longer express cleanly. Only then do
   LangGraph's graph topology and state reducers earn their dependency weight.

**Best-fit target (the "recommend" answer):** durable multi-step clinical/admin
pipelines — but pursued as a **Cloudflare Workflows** effort, with **LangGraph named as
the fallback** should multi-agent topology arrive. This is the most defensible way to
"leverage LangGraph": scope the need narrowly, close it with the native tool first, and
adopt the heavier framework only when its unique shape is required.

## If we still choose to pilot LangGraph

Should the decision go the other way, keep the pilot fail-fast and contained:

- **Scope:** exactly one admin pipeline (e.g. research→draft→compile), behind a flag.
  Do **not** touch patient chat or the approval-gated write tools.
- **Checkpointer:** implement a `BaseCheckpointSaver` over **D1** (durable) with an
  optional KV mirror for hot reads — LangGraph's in-memory saver does not survive the
  Workers isolate, so this is mandatory, not optional.
- **Isolation:** all graph code lives in `packages/server` (server-only). Verify with
  `node scripts/check-isolation.mjs` — a LangChain import leaking into a client bundle
  fails the build by design.
- **Provider:** drive Claude through LangGraph's Anthropic binding only; do not let the
  LangChain surface reintroduce other providers (Anthropic-only is locked).
- **Kill criteria:** if the custom checkpointer is fragile on Workers, or bundle size /
  cold-start regresses, or the graph doesn't out-clarify the existing `escalate` +
  tool-call flow — stop, and fall back to Cloudflare Workflows.

## References

- Agent loop & escalation — `packages/server/src/agents.ts`
- Tool gateway & approval gates — `packages/server/src/tools.ts`
- Job runner (the durability gap) — `packages/server/src/jobs.ts`,
  `packages/server/src/jobs/handlers.ts`
- Chat persistence — `functions/api/agent/patient.ts`,
  `apps/admin/app/api/agent/admin/route.ts`
- Locked architecture decisions — `docs/clinical-agent-platform.md`, `CLAUDE.md`
