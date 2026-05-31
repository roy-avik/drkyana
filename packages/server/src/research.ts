/**
 * Deep-research inference runs (plan item 5). Server-only.
 *
 * Unlike `jobs.ts` (KV-backed, for radiology/PDF artifacts the UI polls),
 * agent_runs are LLM analyses over practice data whose TOKEN + COST are
 * persisted to D1 for spend visibility. A run is created `running`, executed
 * with `generateText` (no streaming, no tools — the data is internal), then
 * finalized `done`/`error` with usage + estimated cost.
 *
 * Two entry points:
 *   - `runAgentRun(env, opts)` — generic; used by the clinician tool
 *     (schedule_agent_run) and the cron. Bounded input → a single Sonnet call.
 *   - `runScheduledResearch(env)` — the cron entry (parallel to runReminders):
 *     runs `intake_patterns` as 'cron' and returns the finished row.
 *
 * Never throws to the caller — a failed run is recorded as status='error' on
 * the row and returned, so neither the cron nor a chat turn hard-fails.
 */
import { generateText } from "ai";
import type { AgentRunKind, AgentRunRow } from "@drkyana/types";
import type { Env } from "./bindings";
import { modelFor, MODEL_IDS, estimateCostUsd } from "./models";

export interface RunAgentRunOptions {
  kind: AgentRunKind;
  /** Run parameters — shape depends on kind. Persisted as input_json. */
  input?: Record<string, unknown>;
  /** Admin email, or 'cron' for scheduled runs. */
  initiatedBy: string;
}

const INTAKE_PATTERNS_SYSTEM = `You are a practice-operations analyst for Dr Kyana, a dental surgeon in Dhaka. You are given a compact list of recent patient intakes. Identify PATTERNS that help her run the practice — you are NOT diagnosing patients.

Report, in GitHub-flavored markdown, concise and scannable:
- **Volume & triage mix** — how many intakes, and the RED/ORANGE/YELLOW/GREEN split.
- **Common complaints** — the most frequent affected areas / symptoms, grouped.
- **Operational signals** — anything actionable: clusters of urgent cases, recurring complaint types that might warrant a protocol, gaps (e.g. many intakes with no follow-up status), time-of-week patterns if visible.
- **Watch-outs** — individual intakes that look like they may have slipped (urgent + still 'new').

Refer to patients by name when you flag an individual; otherwise aggregate. Keep it under ~300 words. Do not invent data not present in the list.`;

interface IntakeAnalysisRow {
  id: string;
  name: string | null;
  affected_area: string | null;
  symptoms: string | null;
  severity: number | null;
  triage_level: string | null;
  status: string;
  created_at: number;
}

/** Build the compact intake block fed to the model. */
async function buildIntakePatternsPrompt(
  env: Env,
  limit: number,
): Promise<{ userPrompt: string; count: number }> {
  const { results } = await env.DB.prepare(
    "SELECT id, name, affected_area, symptoms, severity, triage_level, status, created_at " +
      "FROM intakes ORDER BY created_at DESC LIMIT ?",
  )
    .bind(limit)
    .all<IntakeAnalysisRow>();

  const rows = results ?? [];
  const lines = rows.map((r) => {
    const when = new Date(r.created_at * 1000).toISOString().slice(0, 10);
    return (
      `- ${when} · ${r.name ?? "Unknown"} · ${r.triage_level ?? "?"} · ` +
      `status=${r.status} · area=${r.affected_area ?? "n/a"} · ` +
      `sev=${r.severity ?? "n/a"} · symptoms=${r.symptoms ?? "n/a"}`
    );
  });

  const userPrompt =
    `Recent intakes (${rows.length}), newest first:\n\n${lines.join("\n")}\n\n` +
    `Analyze for practice-operations patterns.`;
  return { userPrompt, count: rows.length };
}

/**
 * Execute one agent run end-to-end: create the row, run the inference, persist
 * usage + cost, finalize. Returns the finished row (status done|error).
 */
export async function runAgentRun(
  env: Env,
  opts: RunAgentRunOptions,
): Promise<AgentRunRow> {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const input = opts.input ?? {};

  // Insert the run as 'running' so it's visible while the model works.
  await env.DB.prepare(
    "INSERT INTO agent_runs (id, kind, status, input_json, initiated_by, started_at, created_at) " +
      "VALUES (?, ?, 'running', ?, ?, ?, ?)",
  )
    .bind(id, opts.kind, JSON.stringify(input), opts.initiatedBy, now, now)
    .run();

  const finalize = async (
    patch: Partial<AgentRunRow>,
  ): Promise<AgentRunRow> => {
    const fin = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      "UPDATE agent_runs SET status = ?, output_md = ?, model_id = ?, " +
        "input_tokens = ?, output_tokens = ?, cost_usd = ?, error = ?, finished_at = ? WHERE id = ?",
    )
      .bind(
        patch.status ?? "done",
        patch.output_md ?? "",
        patch.model_id ?? null,
        patch.input_tokens ?? 0,
        patch.output_tokens ?? 0,
        patch.cost_usd ?? 0,
        patch.error ?? null,
        fin,
        id,
      )
      .run();
    return {
      id,
      kind: opts.kind,
      status: patch.status ?? "done",
      input_json: JSON.stringify(input),
      output_md: patch.output_md ?? "",
      model_id: patch.model_id ?? null,
      input_tokens: patch.input_tokens ?? 0,
      output_tokens: patch.output_tokens ?? 0,
      cost_usd: patch.cost_usd ?? 0,
      error: patch.error ?? null,
      initiated_by: opts.initiatedBy,
      started_at: now,
      finished_at: fin,
      created_at: now,
    };
  };

  try {
    if (opts.kind !== "intake_patterns") {
      return await finalize({ status: "error", error: `unknown run kind: ${opts.kind}` });
    }
    const limit = Math.min(Math.max(Number(input.limit ?? 30), 1), 100);
    const { userPrompt, count } = await buildIntakePatternsPrompt(env, limit);
    if (count === 0) {
      return await finalize({
        status: "done",
        model_id: null,
        output_md: "No intakes yet — nothing to analyze.",
      });
    }

    const modelId = MODEL_IDS.standard;
    const { text, usage } = await generateText({
      model: modelFor(env, "standard"),
      messages: [
        { role: "system", content: INTAKE_PATTERNS_SYSTEM },
        { role: "user", content: userPrompt },
      ],
    });

    const inputTokens = usage?.inputTokens ?? 0;
    const outputTokens = usage?.outputTokens ?? 0;
    return await finalize({
      status: "done",
      output_md: text,
      model_id: modelId,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: estimateCostUsd(modelId, { inputTokens, outputTokens }),
    });
  } catch (e) {
    return await finalize({
      status: "error",
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export interface ScheduledResearchResult {
  runId: string;
  status: AgentRunRow["status"];
  costUsd: number;
  error?: string;
}

/**
 * Cron entry: run the standing `intake_patterns` analysis as 'cron'. Mirrors
 * runReminders' shape. The result row is the durable output (viewable in the
 * admin /research surface); this returns a compact status for the caller.
 */
export async function runScheduledResearch(
  env: Env,
): Promise<ScheduledResearchResult> {
  const row = await runAgentRun(env, {
    kind: "intake_patterns",
    input: { limit: 50 },
    initiatedBy: "cron",
  });
  return {
    runId: row.id,
    status: row.status,
    costUsd: row.cost_usd,
    error: row.error ?? undefined,
  };
}
