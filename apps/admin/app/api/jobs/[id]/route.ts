import "server-only";
import { jobRunner, type AgentContext, type Env } from "@drkyana/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { withAccess } from "@/server/access";

/**
 * GET /api/jobs/:id — poll a background job (radiology / compile_pdf) for the
 * admin UI. Returns the JobRecord (status + result/error) from the runner, which
 * reads `job:{id}` from KV. Access-gated (admin only).
 */
export const dynamic = "force-dynamic";

function idFromUrl(req: Request): string {
  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(segments[segments.length - 1] ?? "");
}

export const GET = withAccess(async (req, identity) => {
  const jobId = idFromUrl(req);
  if (!jobId) return Response.json({ error: "missing_job_id" }, { status: 400 });

  const { env: cfEnv, ctx } = getCloudflareContext();
  const env = cfEnv as unknown as Env;

  // Minimal context for a KV read — the runner only touches env.KV here.
  const agentCtx: AgentContext = {
    env,
    caller: { kind: "admin", email: identity.email, accessSub: identity.sub },
    locale: "en",
    waitUntil: (p) => ctx.waitUntil(p),
  };

  const record = await jobRunner.get(agentCtx, jobId);
  if (!record) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ job: record });
});
