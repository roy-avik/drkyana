/**
 * drkyana ops Workflows — the scheduled jobs the patient/admin Workers cannot
 * run themselves.
 *
 * WHY a separate Worker: the admin app is built with @opennextjs/cloudflare,
 * whose generated worker exports only `fetch` — there is no supported
 * `scheduled()` hook to hang a cron on. Cloudflare Workflows solves this
 * directly: a `schedules` array on the Workflow binding (wrangler.jsonc)
 * creates an instance on each cron firing, with no `scheduled` handler needed.
 * Each firing also gets durable, retryable steps and up to an hour of run time.
 *
 * All business logic lives in @drkyana/server (shared, server-only) — these
 * classes are thin durable wrappers. Each step writes a compact record of its
 * last run to KV (`ops:last:<name>`) so the admin surface can answer "when did
 * retention last run, and what did it purge" without a separate store.
 */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import {
  runReminders,
  runRetention,
  runScheduledResearch,
  type Env as ServerEnv,
} from "@drkyana/server";

/** Server bindings + the Workflow bindings this Worker declares. */
export type OpsEnv = ServerEnv & {
  REMINDER_WF: Workflow;
  RETENTION_WF: Workflow;
  RESEARCH_WF: Workflow;
  /** Secret gating the manual /trigger endpoint (testing without waiting for cron). */
  OPS_TRIGGER_TOKEN?: string;
};

/** Retry policy for the single work step — the underlying helpers never throw,
 *  so this only catches genuine infrastructure failures (D1/email transport). */
const STEP_RETRY = { retries: { limit: 3, delay: "30 seconds", backoff: "exponential" }, timeout: "5 minutes" } as const;

/** Record a workflow's last run to KV for lightweight observability. */
async function recordLastRun(env: OpsEnv, name: string, result: unknown, event: WorkflowEvent<unknown>): Promise<void> {
  const record = {
    at: Date.now(),
    cron: event.schedule?.cron ?? "manual",
    scheduledTime: event.schedule?.scheduledTime ?? null,
    result,
  };
  // 35-day TTL: long enough to see "did last night's run happen", short enough
  // to self-clean. Best-effort — observability must not fail the job.
  await env.KV.put(`ops:last:${name}`, JSON.stringify(record), { expirationTtl: 35 * 24 * 60 * 60 }).catch(() => {});
}

/**
 * Daily: email Dr Kyana the reminders digest (upcoming appointments + urgent
 * uncontacted intakes). runReminders is best-effort and reports send failures
 * on its result rather than throwing, so the step succeeds even when email is
 * down — the failure is visible in the recorded result, not a lost retry.
 */
export class ReminderWorkflow extends WorkflowEntrypoint<OpsEnv> {
  async run(event: WorkflowEvent<unknown>, step: WorkflowStep): Promise<void> {
    const result = await step.do("send reminders", STEP_RETRY, () => runReminders(this.env));
    await step.do("record run", () => recordLastRun(this.env, "reminders", result, event));
  }
}

/**
 * Daily: purge spent OTPs and compact idle session transcripts (PDPA). Pure D1
 * deletes/updates; idempotent, so a retry after a partial failure is safe.
 */
export class RetentionWorkflow extends WorkflowEntrypoint<OpsEnv> {
  async run(event: WorkflowEvent<unknown>, step: WorkflowStep): Promise<void> {
    const result = await step.do("run retention", STEP_RETRY, () => runRetention(this.env));
    await step.do("record run", () => recordLastRun(this.env, "retention", result, event));
  }
}

/**
 * Daily: the standing intake-patterns analysis, persisted to `agent_runs` with
 * token + cost. This is the durable home for the scheduled research path;
 * the interactive `schedule_agent_run` tool still runs inline in admin chat.
 * The LLM call is the expensive step — its own retry envelope keeps a transient
 * model error from re-running everything.
 */
export class ScheduledResearchWorkflow extends WorkflowEntrypoint<OpsEnv> {
  async run(event: WorkflowEvent<unknown>, step: WorkflowStep): Promise<void> {
    const result = await step.do(
      "intake patterns analysis",
      { retries: { limit: 2, delay: "1 minute", backoff: "exponential" }, timeout: "10 minutes" },
      () => runScheduledResearch(this.env),
    );
    await step.do("record run", () => recordLastRun(this.env, "research", result, event));
  }
}
