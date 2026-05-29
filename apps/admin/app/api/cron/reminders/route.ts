import "server-only";
import { withAccess } from "@/server/access";
import { runReminders, type Env } from "@drkyana/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/reminders — run the daily reminder pass on demand.
 *
 * WHY a route (and not a worker `scheduled` export): the admin app is built with
 * @opennextjs/cloudflare, whose generated `.open-next/worker.js` (the wrangler
 * `main`) exports ONLY a `fetch` handler. OpenNext provides no supported hook to
 * add a custom `scheduled` export to that generated worker, so a Cloudflare cron
 * trigger has no `scheduled()` to call. Rather than fork the generated worker
 * (brittle across OpenNext upgrades), v1 exposes the reminder logic as this
 * Access-gated route. The cron is therefore NOT auto-firing yet.
 *
 * To actually run on the `0 3 * * *` cron, pick one when provisioning:
 *   (a) a tiny separate "reminders" Worker that exports `scheduled()` and calls
 *       this same `runReminders(env, …)` over the shared D1/EMAIL bindings, or
 *   (b) an external scheduler (Cron-triggered Worker / GitHub Action) that POSTs
 *       this endpoint with a service token.
 * The cron logic itself (packages/server/src/scheduled/reminders.ts) is final;
 * only the trigger wiring is deferred. See the cron note in the wrangler config.
 */
export const POST = withAccess(async () => {
  const env = getCloudflareContext().env as unknown as Env;
  const result = await runReminders(env);
  return Response.json(result);
});
