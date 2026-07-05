import "server-only";
import { buildProtectedResourceMetadata } from "@drkyana/server";
import { corsJson, corsPreflight, publicOrigin } from "@/server/oauth-http";

/**
 * Protected-resource metadata (RFC 9728) for /api/mcp. Public by design —
 * served at /.well-known/oauth-protected-resource[/api/mcp] via rewrite.
 * This is what an MCP client fetches after our 401's WWW-Authenticate points
 * it here; it then discovers the authorization server from the payload.
 */
export function GET(req: Request): Response {
  return corsJson(buildProtectedResourceMetadata(publicOrigin(req)));
}
export function OPTIONS(): Response {
  return corsPreflight();
}
