import "server-only";

/**
 * Shared HTTP helpers for the OAuth endpoints (server-only).
 *
 * The metadata/register/token endpoints are called by Claude's and ChatGPT's
 * backends AND sometimes from browser contexts, so they carry permissive CORS
 * — they hold no PHI (metadata is public; register/token are self-protecting
 * via PKCE + single-use codes).
 */

/** Public origin of this deployment, derived from the request (https-forced). */
export function publicOrigin(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? url.host;
  const local = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  return `${local ? url.protocol : "https:"}//${host}`;
}

export const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, mcp-protocol-version",
  "access-control-max-age": "86400",
};

export function corsJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
