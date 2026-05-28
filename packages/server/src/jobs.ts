/**
 * Background job runner contract. Long jobs (radiology vision+research, PDF
 * render) do NOT stream — they write status/result to KV and the admin UI
 * polls. No Inngest in v1.
 *
 * Key shape: `job:{id}` in KV holds a JobRecord. `enqueue` writes pending +
 * schedules processing via ctx.waitUntil (or a Queue later); `get` reads it.
 */
import type { JobRecord, JobKind, JobStatus } from "@drkyana/types";
import type { AgentContext } from "./context";

export const jobKey = (id: string) => `job:${id}`;

/** Job records live in KV for a day — long enough for the UI to poll the result. */
const JOB_TTL_SECONDS = 86_400;

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
 * `createJobRunner(handlers)` — `handlers` maps each JobKind to an async
 * processor. `enqueue` writes a pending record, returns its id immediately, and
 * drives the record through running → done/error via `ctx.waitUntil`.
 */
export function createJobRunner(
  handlers: Record<JobKind, (ctx: AgentContext, input: unknown) => Promise<unknown>>,
): JobRunner {
  async function write(
    ctx: AgentContext,
    record: JobRecord,
  ): Promise<void> {
    await ctx.env.KV.put(jobKey(record.id), JSON.stringify(record), {
      expirationTtl: JOB_TTL_SECONDS,
    });
  }

  function patch(
    record: JobRecord,
    status: JobStatus,
    extra?: Partial<JobRecord>,
  ): JobRecord {
    return { ...record, ...extra, status, updated_at: Date.now() };
  }

  return {
    async enqueue<TInput>(ctx: AgentContext, kind: JobKind, input: TInput) {
      const id = crypto.randomUUID();
      const now = Date.now();
      const initial: JobRecord = {
        id,
        kind,
        status: "pending",
        created_at: now,
        updated_at: now,
      };
      await write(ctx, initial);

      ctx.waitUntil(
        (async () => {
          let record = patch(initial, "running");
          await write(ctx, record);
          try {
            const result = await handlers[kind](ctx, input);
            record = patch(record, "done", { result });
          } catch (e) {
            record = patch(record, "error", {
              error: e instanceof Error ? e.message : String(e),
            });
          }
          await write(ctx, record);
        })(),
      );

      return { jobId: id };
    },

    async get<TResult>(ctx: AgentContext, jobId: string) {
      const raw = await ctx.env.KV.get(jobKey(jobId), "text");
      if (raw == null) return null;
      return JSON.parse(raw) as JobRecord<TResult>;
    },
  };
}
