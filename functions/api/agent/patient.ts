/**
 * Patient agent endpoint — Cloudflare Pages Function (server-side execution
 * context; importing @drkyana/server is allowed here).
 *
 * Route: POST /api/agent/patient
 * Bindings (configure on the patient Pages project): DB, KV, secrets
 * ANTHROPIC_API_KEY + PATIENT_AGENT_TOKEN + IP_HASH_SALT. NO admin tools here.
 *
 * Phase 1A implements this:
 *   - validate PATIENT_AGENT_TOKEN + per-IP KV rate limit,
 *   - build a patient AgentContext (caller.kind = "patient"),
 *   - load/persist session in D1, match returning patient by phone for memory,
 *   - streamAgent(patientAgentSpec, ctx, history) → UI message stream Response.
 */
import type { AgentSpec } from "@drkyana/server";

interface PagesContext {
  request: Request;
  env: Record<string, unknown>;
}

export const onRequestPost = async (_ctx: PagesContext): Promise<Response> => {
  const _contract: AgentSpec | null = null; // anchors the frozen contract
  void _contract;
  return new Response(JSON.stringify({ error: "not_implemented", phase: "1A" }), {
    status: 501,
    headers: { "content-type": "application/json" },
  });
};
