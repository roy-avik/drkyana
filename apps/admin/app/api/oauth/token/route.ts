import "server-only";
import { exchangeToken, type Env } from "@drkyana/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { corsJson, corsPreflight } from "@/server/oauth-http";

/**
 * OAuth token endpoint: authorization_code (+ mandatory PKCE) and rotating
 * refresh_token grants. Called server-to-server by the connector backends —
 * it must be reachable WITHOUT Cloudflare Access (see docs/connect-agents.md
 * for the Zero Trust path-bypass setup). Codes are single-use and bound to
 * the Access-verified identity minted at /oauth/authorize.
 */
export async function POST(req: Request): Promise<Response> {
  let form: Record<string, string>;
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      form = (await req.json()) as Record<string, string>;
    } else {
      form = Object.fromEntries(new URLSearchParams(await req.text()));
    }
  } catch {
    return corsJson({ error: "invalid_request" }, 400);
  }
  const env = getCloudflareContext().env as unknown as Env;
  const { status, payload } = await exchangeToken(env, form);
  return corsJson(payload, status);
}
export function OPTIONS(): Response {
  return corsPreflight();
}
