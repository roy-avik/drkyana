import "server-only";
import { withAccess } from "@/server/access";
import { runReminders, type Env } from "@drkyana/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/reminders — run the daily reminder pass on demand.
 *
 * This route is the ON-DEMAND trigger. The SCHEDULED trigger lives elsewhere:
 * the admin app is built with @opennextjs/cloudflare, whose generated worker
 * exports only a `fetch` handler, so a Cloudflare cron has no `scheduled()` to
 * call here. The daily run is instead the `drkyana-ops` Worker's
 * ReminderWorkflow (apps/ops), fired by a Workflow `schedules` cron — same
 * `runReminders(env, …)` over the shared D1/EMAIL bindings. This route stays
 * useful for running the pass immediately (e.g. from the console) without
 * waiting for 03:00 UTC.
 */
export const POST = withAccess(async () => {
  const env = getCloudflareContext().env as unknown as Env;
  const result = await runReminders(env);
  return Response.json(result);
});
