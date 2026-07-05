import "server-only";
import {
  renderAuthorizePage,
  completeAuthorize,
  type AuthorizeParams,
  type Env,
} from "@drkyana/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { verifyAccess, AccessDeniedError } from "@/server/access";

/**
 * OAuth authorize endpoint — the ONE OAuth route that stays BEHIND the
 * Cloudflare Access SSO app. The connector opens this URL in the system
 * browser; Access forces the Google sign-in; we re-verify the Access JWT and
 * render the consent page. Approving mints a single-use code bound to that
 * verified identity — this is where "Access says it's the dentist" becomes
 * an OAuth grant. Everything sensitive stays on this side of the fence.
 */

function deny(err: unknown): Response {
  const status = err instanceof AccessDeniedError ? err.status : 401;
  return new Response(
    "Sign-in required. Open this page in a browser signed in to the admin console.",
    { status, headers: { "content-type": "text/plain" } },
  );
}

function badRequest(message: string): Response {
  return new Response(`Authorization error: ${message}`, {
    status: 400,
    headers: { "content-type": "text/plain" },
  });
}

export async function GET(req: Request): Promise<Response> {
  let identity;
  try {
    identity = await verifyAccess(req);
  } catch (err) {
    return deny(err);
  }
  const env = getCloudflareContext().env as unknown as Env;
  const params = Object.fromEntries(
    new URL(req.url).searchParams,
  ) as AuthorizeParams;
  const page = await renderAuthorizePage(env, params, identity.email);
  if ("error" in page) return badRequest(page.error);
  return new Response(page.html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function POST(req: Request): Promise<Response> {
  let identity;
  try {
    identity = await verifyAccess(req);
  } catch (err) {
    return deny(err);
  }
  const env = getCloudflareContext().env as unknown as Env;
  const form = Object.fromEntries(
    new URLSearchParams(await req.text()),
  ) as Record<string, string>;
  const result = await completeAuthorize(env, form, {
    email: identity.email,
    sub: identity.sub,
  });
  if ("error" in result) return badRequest(result.error);
  return new Response(null, {
    status: 302,
    headers: { location: result.redirect, "cache-control": "no-store" },
  });
}
