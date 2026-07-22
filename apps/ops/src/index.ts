/**
 * drkyana-ops Worker entry.
 *
 * The Workflow classes below run automatically on their `schedules` (see
 * wrangler.jsonc) — no `fetch`/`scheduled` handler is needed for that. This
 * default handler exists only for:
 *   - GET  /            — a health check + the last-run timestamps from KV.
 *   - POST /trigger/<wf> — fire a workflow immediately for testing, gated by a
 *                          bearer token (OPS_TRIGGER_TOKEN secret). Avoids
 *                          waiting until 03:00 to verify a change.
 *
 * There is no PHI here and no public surface: the trigger requires the secret,
 * and there's nothing sensitive in the health output.
 */
import { ReminderWorkflow, RetentionWorkflow, ScheduledResearchWorkflow, type OpsEnv } from "./workflows";

export { ReminderWorkflow, RetentionWorkflow, ScheduledResearchWorkflow };

const WORKFLOWS: Record<string, keyof OpsEnv> = {
  reminders: "REMINDER_WF",
  retention: "RETENTION_WF",
  research: "RESEARCH_WF",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Constant-time-ish bearer check for the manual trigger. */
function authorized(req: Request, env: OpsEnv): boolean {
  const expected = env.OPS_TRIGGER_TOKEN;
  if (!expected) return false; // no token configured → trigger disabled
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(req: Request, env: OpsEnv): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/") {
      const lastRuns: Record<string, unknown> = {};
      for (const name of Object.keys(WORKFLOWS)) {
        const raw = await env.KV.get(`ops:last:${name}`, "text");
        lastRuns[name] = raw ? JSON.parse(raw) : null;
      }
      return json({ ok: true, service: "drkyana-ops", lastRuns });
    }

    // POST /trigger/<workflow> — manual fire for testing.
    const trigger = url.pathname.match(/^\/trigger\/([a-z]+)$/);
    if (req.method === "POST" && trigger) {
      if (!authorized(req, env)) return json({ error: "unauthorized" }, 401);
      const binding = WORKFLOWS[trigger[1]!];
      if (!binding) return json({ error: "unknown workflow" }, 404);
      const wf = env[binding] as unknown as Workflow;
      const instance = await wf.create();
      return json({ ok: true, workflow: trigger[1], instanceId: instance.id });
    }

    return json({ error: "not found" }, 404);
  },
};
