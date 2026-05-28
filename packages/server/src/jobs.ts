/**
 * Background job runner contract. Long jobs (radiology vision+research, PDF
 * render) do NOT stream — they write status/result to KV and the admin UI
 * polls. No Inngest in v1.
 *
 * Key shape: `job:{id}` in KV holds a JobRecord. `enqueue` writes pending +
 * schedules processing via ctx.waitUntil (or a Queue later); `get` reads it.
 */
import type { JobRecord, JobKind } from "@drkyana/types";
import type { AgentContext } from "./context";

export const jobKey = (id: string) => `job:${id}`;

export interface JobRunner {
  /** Create a pending job, kick off async processing, return its id immediately. */
  enqueue<TInput>(
    ctx: AgentContext,
    kind: JobKind,
    input: TInput,
  ): Promise<{ jobId: string }>;
  /** Read current status/result (used by GET /api/jobs/:id). */
  get<TResult>(ctx: AgentContext, jobId: string): Promise<JobRecord<TResult> | null>;
}

/**
 * Phase 1 implements `createJobRunner(handlers)` where handlers maps each
 * JobKind to an async processor that updates KV through running → done/error.
 */
export declare function createJobRunner(
  handlers: Record<JobKind, (ctx: AgentContext, input: unknown) => Promise<unknown>>,
): JobRunner;
