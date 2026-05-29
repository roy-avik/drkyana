import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Cloudflare Access auth gate (server-only).
 *
 * Every request to the admin app is fronted by Cloudflare Access (Dr Kyana signs
 * in with Google). Access injects a signed JWT in the `Cf-Access-Jwt-Assertion`
 * header (and a `CF_Authorization` cookie). We verify that JWT against the team's
 * JWKS endpoint and check the audience (AUD) tag before any route handler runs.
 *
 * Config comes from env at deploy time:
 *   ACCESS_TEAM_DOMAIN — e.g. "drkyana.cloudflareaccess.com"
 *   ACCESS_AUD         — the Access application's Audience tag
 *
 * The verified identity (email) is returned so handlers / tools can attribute
 * actions and enforce authorization from the JWT, never from request body args.
 */

export interface AdminIdentity {
  email: string;
  sub: string;
  /** Raw verified claims, in case a handler needs more (name, groups, etc.). */
  claims: Record<string, unknown>;
}

export class AccessDeniedError extends Error {
  status = 401;
  constructor(message = "unauthorized") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

const ACCESS_HEADER = "cf-access-jwt-assertion";
const ACCESS_COOKIE = "CF_Authorization";

// Cache JWKS sets per team domain across requests (module scope persists on the
// warm worker). createRemoteJWKSet itself caches + rotates keys internally.
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksFor(teamDomain: string) {
  let set = jwksCache.get(teamDomain);
  if (!set) {
    const url = new URL(`https://${teamDomain}/cdn-cgi/access/certs`);
    set = createRemoteJWKSet(url);
    jwksCache.set(teamDomain, set);
  }
  return set;
}

function readToken(req: Request): string | null {
  const header = req.headers.get(ACCESS_HEADER);
  if (header) return header;
  // Fall back to the cookie Access also sets (useful for navigations).
  const cookie = req.headers.get("cookie");
  if (cookie) {
    for (const part of cookie.split(";")) {
      const [k, ...v] = part.trim().split("=");
      if (k === ACCESS_COOKIE) return v.join("=");
    }
  }
  return null;
}

function accessConfig(): { teamDomain: string; aud: string } | null {
  let env: CloudflareEnv | undefined;
  try {
    env = getCloudflareContext().env;
  } catch {
    env = undefined;
  }
  const teamDomain = env?.ACCESS_TEAM_DOMAIN ?? process.env.ACCESS_TEAM_DOMAIN;
  const aud = env?.ACCESS_AUD ?? process.env.ACCESS_AUD;
  if (!teamDomain || !aud) return null;
  return { teamDomain, aud };
}

/** Is the explicit local-dev bypass enabled? Must be opt-in, never the default. */
function devOpenEnabled(): boolean {
  let env: CloudflareEnv | undefined;
  try {
    env = getCloudflareContext().env;
  } catch {
    env = undefined;
  }
  const flag =
    (env as { ADMIN_DEV_OPEN?: string } | undefined)?.ADMIN_DEV_OPEN ??
    process.env.ADMIN_DEV_OPEN;
  return flag === "1";
}

/**
 * Verify the Cloudflare Access JWT on a request. Throws AccessDeniedError when
 * the token is missing, malformed, expired, audience-mismatched, or unsigned by
 * the team's keys.
 *
 * FAIL CLOSED: if ACCESS_TEAM_DOMAIN / ACCESS_AUD are not configured, every
 * request is DENIED — unless the explicit `ADMIN_DEV_OPEN=1` flag is set (local
 * dev only). This prevents a deploy made before Cloudflare Access is wired from
 * silently exposing patient PHI. Production must set ACCESS_TEAM_DOMAIN+ACCESS_AUD
 * and must NOT set ADMIN_DEV_OPEN.
 */
export async function verifyAccess(req: Request): Promise<AdminIdentity> {
  const cfg = accessConfig();
  if (!cfg) {
    if (devOpenEnabled()) {
      // Explicit local-dev bypass only.
      return { email: "dev@localhost", sub: "dev", claims: { dev: true } };
    }
    // Unconfigured + not explicitly opened → deny. Never expose PHI by default.
    throw new AccessDeniedError("admin access not configured");
  }

  const token = readToken(req);
  if (!token) throw new AccessDeniedError("missing Access token");

  try {
    const { payload } = await jwtVerify(token, jwksFor(cfg.teamDomain), {
      issuer: `https://${cfg.teamDomain}`,
      audience: cfg.aud,
    });
    const email =
      (typeof payload.email === "string" && payload.email) ||
      (typeof payload.sub === "string" && payload.sub) ||
      "";
    if (!email) throw new AccessDeniedError("token missing identity");
    return {
      email,
      sub: typeof payload.sub === "string" ? payload.sub : email,
      claims: payload as Record<string, unknown>,
    };
  } catch (err) {
    if (err instanceof AccessDeniedError) throw err;
    throw new AccessDeniedError("invalid Access token");
  }
}

/**
 * Wrap a route handler so it only runs for a verified admin. On failure returns
 * a 401 JSON response. The verified identity is passed to the handler.
 */
export function withAccess(
  handler: (req: Request, identity: AdminIdentity) => Promise<Response> | Response,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    let identity: AdminIdentity;
    try {
      identity = await verifyAccess(req);
    } catch (err) {
      const status = err instanceof AccessDeniedError ? err.status : 401;
      return new Response(
        JSON.stringify({ error: "unauthorized", detail: (err as Error).message }),
        { status, headers: { "content-type": "application/json" } },
      );
    }
    return handler(req, identity);
  };
}
