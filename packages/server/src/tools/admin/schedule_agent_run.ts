/**
 * schedule_agent_run — clinician-initiated deep-research run. Dr Kyana asks the
 * assistant to analyze recent practice data ("look at recent intakes for
 * patterns", "any trends in the queue?") and this runs the inference, persists
 * it to agent_runs with token + cost accounting, and returns the result.
 *
 * Runs INLINE (bounded input → a single Sonnet call, ~10-20s) rather than as a
 * KV-polled job — the output is text Dr Kyana reads in chat. The same
 * `runAgentRun` core powers the cron (scheduled/research path).
 *
 * category 'read': it writes an agent_runs row (operational, not clinical) and
 * returns analysis — no approval gate, same posture as web_search. The cost is
 * surfaced so Dr Kyana sees what the run spent.
 */
import { z } from "zod";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";
import { runAgentRun } from "../../research";

const inputSchema = z.object({
  kind: z
    .enum(["intake_patterns"])
    .describe("The analysis to run. 'intake_patterns' reviews recent intakes for operational patterns."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("How many recent intakes to analyze (default 30)."),
});

export interface ScheduleAgentRunResult {
  runId: string;
  status: string;
  output: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export const scheduleAgentRunTool = defineTool({
  name: "schedule_agent_run",
  description:
    "Run a deep-research analysis over recent practice data and return the " +
    "result. 'intake_patterns' reviews recent intakes for operational patterns " +
    "(volume, triage mix, common complaints, cases that may have slipped). The " +
    "run is persisted with its token + USD cost (visible in the research log). " +
    "Use when Dr Kyana asks for trends/patterns across the queue — not for a " +
    "single patient (use get_intake for that). Present the returned markdown to " +
    "her and mention the cost briefly.",
  category: "read",
  inputSchema,
  async execute(args, ctx: AgentContext): Promise<ScheduleAgentRunResult> {
    assertAdmin(ctx);
    const initiatedBy = ctx.caller.kind === "admin" ? ctx.caller.email : "system";
    const row = await runAgentRun(ctx.env, {
      kind: args.kind,
      input: { limit: args.limit ?? 30 },
      initiatedBy,
    });
    return {
      runId: row.id,
      status: row.status,
      output: row.output_md,
      costUsd: row.cost_usd,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
    };
  },
});
