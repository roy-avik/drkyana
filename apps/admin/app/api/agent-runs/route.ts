import "server-only";
import { withAccess } from "@/server/access";
import { listAgentRuns } from "@/server/db";
import { runAgentRun, type Env } from "@drkyana/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

/** GET /api/agent-runs — recent deep-research runs (newest first). */
export const GET = withAccess(async () => {
  const runs = await listAgentRuns(30);
  return Response.json({ runs });
});

/**
 * POST /api/agent-runs — kick off a run on demand from the Research page.
 * Body: { kind?: "intake_patterns", limit?: number }
 * Initiated-by is the verified Access email, never a body arg.
 */
export const POST = withAccess(async (req, identity) => {
  const body = (await req.json().catch(() => ({}))) as {
    kind?: "intake_patterns";
    limit?: number;
  };
  const env = getCloudflareContext().env as unknown as Env;
  const row = await runAgentRun(env, {
    kind: body.kind ?? "intake_patterns",
    input: { limit: body.limit ?? 50 },
    initiatedBy: identity.email,
  });
  return Response.json({ run: row });
});
