import "server-only";
import { withAccess } from "@/server/access";
import { runScheduledResearch, type Env } from "@drkyana/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/research — run the standing deep-research pass on demand.
 *
 * Same trigger story as /api/cron/reminders: OpenNext's generated worker only
 * exports `fetch`, so there's no `scheduled()` for a Cloudflare cron to call.
 * The logic (packages/server/src/research.ts) is final; wire a tiny separate
 * cron Worker — or an external scheduler POSTing this endpoint with a service
 * token — to fire it on a schedule (e.g. weekly). For now it's Access-gated and
 * runnable on demand (also from the Research page's "Run now").
 */
export const POST = withAccess(async () => {
  const env = getCloudflareContext().env as unknown as Env;
  const result = await runScheduledResearch(env);
  return Response.json(result);
});
