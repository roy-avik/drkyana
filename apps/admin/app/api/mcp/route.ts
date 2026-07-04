import "server-only";
import {
  handleMcpPost,
  handleMcpMethodNotAllowed,
  type AgentContext,
  type Env,
} from "@drkyana/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { verifyAccess, AccessDeniedError } from "@/server/access";

/**
 * Admin MCP endpoint (Streamable HTTP, stateless JSON). Lets agent hosts
 * (Claude etc.) call the admin toolset and render the admin views as MCP Apps
 * — see docs/view-dsl.md.
 *
 * Auth is Cloudflare Access, same as every admin route: connect a host with an
 * Access service token (CF-Access-Client-Id/-Secret headers). The verified
 * identity becomes the admin AgentContext; tools still run assertAdmin(ctx).
 */

export async function POST(req: Request): Promise<Response> {
  let identity;
  try {
    identity = await verifyAccess(req);
  } catch (err) {
    const status = err instanceof AccessDeniedError ? err.status : 401;
    return new Response(
      JSON.stringify({ error: "unauthorized", detail: (err as Error).message }),
      { status, headers: { "content-type": "application/json" } },
    );
  }

  const { env: cfEnv, ctx } = getCloudflareContext();
  const agentCtx: AgentContext = {
    env: cfEnv as unknown as Env,
    caller: { kind: "admin", email: identity.email, accessSub: identity.sub },
    locale: "en",
    abortSignal: req.signal,
    waitUntil: (p) => ctx.waitUntil(p),
  };
  return handleMcpPost(req, agentCtx);
}

// No SSE streams and no sessions — Streamable HTTP allows POST-only servers.
export function GET(): Response {
  return handleMcpMethodNotAllowed();
}
export function DELETE(): Response {
  return handleMcpMethodNotAllowed();
}
