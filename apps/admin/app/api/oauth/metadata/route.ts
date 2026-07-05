import "server-only";
import { buildAuthServerMetadata } from "@drkyana/server";
import { corsJson, corsPreflight, publicOrigin } from "@/server/oauth-http";

/**
 * OAuth authorization-server metadata (RFC 8414). Public by design — served
 * at /.well-known/oauth-authorization-server via the next.config rewrite.
 */
export function GET(req: Request): Response {
  return corsJson(buildAuthServerMetadata(publicOrigin(req)));
}
export function OPTIONS(): Response {
  return corsPreflight();
}
