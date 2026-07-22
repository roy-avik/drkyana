import "server-only";
import { withAccess } from "@/server/access";
import { runScheduledResearch, type Env } from "@drkyana/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/research — run the standing deep-research pass on demand.
 *
 * On-demand trigger. The scheduled run is the `drkyana-ops` Worker's
 * ScheduledResearchWorkflow (apps/ops), fired by a Workflow `schedules` cron —
 * OpenNext's generated worker exports only `fetch`, so the daily job cannot
 * live here. This route stays Access-gated and runnable on demand (also from
 * the Research page's "Run now").
 */
export const POST = withAccess(async () => {
  const env = getCloudflareContext().env as unknown as Env;
  const result = await runScheduledResearch(env);
  return Response.json(result);
});
