import "server-only";
import type { AgentSpec } from "@drkyana/server";
import { withAccess } from "@/server/access";

/**
 * Admin agent endpoint (server-only execution context — importing @drkyana/server
 * is allowed here per the isolation guard).
 *
 * Phase 1C implements the agent loop:
 *   - build AgentContext from the Cloudflare bindings (getCloudflareContext)
 *     and the verified Cloudflare Access JWT (admin caller, available here as
 *     `identity` from withAccess),
 *   - load session history from D1,
 *   - call streamAgent(adminAgentSpec, ctx, history) and return the
 *     UI message stream Response for `useChat`.
 *
 * Until then this is gated by Cloudflare Access (401 if unverified) and returns
 * 501 so the chat UI can render an "agent coming online" state.
 */
export const POST = withAccess(async (_req, _identity): Promise<Response> => {
  // Placeholder until Phase 1C. The `AgentSpec` import anchors the frozen
  // contract so the route compiles against it.
  const _contract: AgentSpec | null = null;
  void _contract;
  return new Response(
    JSON.stringify({ error: "not_implemented", phase: "1C" }),
    { status: 501, headers: { "content-type": "application/json" } },
  );
});
