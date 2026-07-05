import "server-only";
import {
  handleMcpPost,
  handleMcpMethodNotAllowed,
  verifyBearer,
  bearerChallenge,
  type AgentContext,
  type Env,
} from "@drkyana/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { verifyAccess } from "@/server/access";
import { CORS_HEADERS, corsPreflight, publicOrigin } from "@/server/oauth-http";

/**
 * Admin MCP endpoint (Streamable HTTP, stateless JSON). Lets agent hosts —
 * Claude / ChatGPT native apps included — call the admin toolset and render
 * the admin views as MCP Apps. See docs/view-dsl.md + docs/connect-agents.md.
 *
 * Auth, in order:
 *  1. OAuth bearer token (minted by /oauth/authorize + /api/oauth/token; the
 *     sign-in behind that flow is the same Cloudflare Access Google SSO).
 *     This is the path native apps use — they cannot send Access headers.
 *  2. Cloudflare Access JWT (browser session or service token), for callers
 *     that DO come through Access.
 *  3. Otherwise 401 with the RFC 9728 WWW-Authenticate challenge, which is
 *     how MCP clients discover the OAuth flow in the first place.
 * Either way the verified identity becomes the admin AgentContext and tools
 * still run assertAdmin(ctx).
 */

export async function POST(req: Request): Promise<Response> {
  const { env: cfEnv, ctx } = getCloudflareContext();
  const env = cfEnv as unknown as Env;

  let identity: { email: string; sub: string } | null = await verifyBearer(env, req);
  if (!identity) {
    try {
      const access = await verifyAccess(req);
      identity = { email: access.email, sub: access.sub };
    } catch {
      identity = null;
    }
  }
  if (!identity) {
    return new Response(
      JSON.stringify({ error: "unauthorized", detail: "OAuth bearer token or Access session required" }),
      {
        status: 401,
        headers: {
          "content-type": "application/json",
          "www-authenticate": bearerChallenge(publicOrigin(req)),
          ...CORS_HEADERS,
        },
      },
    );
  }

  const agentCtx: AgentContext = {
    env,
    caller: { kind: "admin", email: identity.email, accessSub: identity.sub },
    locale: "en",
    abortSignal: req.signal,
    waitUntil: (p) => ctx.waitUntil(p),
  };
  const res = await handleMcpPost(req, agentCtx);
  // CORS for browser-based MCP hosts/inspectors; auth already enforced above.
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

export function OPTIONS(): Response {
  return corsPreflight();
}

// No SSE streams and no sessions — Streamable HTTP allows POST-only servers.
export function GET(): Response {
  return handleMcpMethodNotAllowed();
}
export function DELETE(): Response {
  return handleMcpMethodNotAllowed();
}
