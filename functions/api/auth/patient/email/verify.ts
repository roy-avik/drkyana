/**
 * Patient email OTP — verify a code.
 *
 * Route: POST /api/auth/patient/email/verify
 * Body: { email: string; code: string }   (sessionId comes from the cookie)
 * Returns:
 *   200 { ok: true, verifiedEmail: string }  + refreshed Set-Cookie
 *   400 { error: "bad_request" | "missing_session" | "no_pending_code" | "invalid_code" }
 *   410 { error: "expired" }
 *   429 { error: "rate_limited" | "too_many_attempts" }
 *
 * The session id is read from the signed httpOnly cookie set by .../email/request
 * (cookie-authoritative — never from input). Success writes
 * `sessions.verified_email` + `sessions.email_verified_at`; the next call to
 * /api/agent/patient reads the same cookie → that verified state, so the
 * model never sees or is trusted with the email.
 */
import { verifyOtp } from "@drkyana/server/otp";
import {
  readSessionCookie,
  serializeSessionCookie,
  type Env,
} from "@drkyana/server";

interface PagesContext {
  request: Request;
  env: Record<string, unknown> & Partial<Env>;
}

interface ReqBody {
  email?: string;
  code?: string;
}

const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 60;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function hashIp(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

async function isRateLimited(env: Env, ipHash: string): Promise<boolean> {
  const key = `otp_ver:${ipHash}`;
  const current = Number((await env.KV.get(key, "text")) ?? "0");
  if (current >= RATE_LIMIT) return true;
  await env.KV.put(key, String(current + 1), {
    expirationTtl: RATE_WINDOW_SECONDS,
  });
  return false;
}

export const onRequestPost = async (ctx: PagesContext): Promise<Response> => {
  const { request, env } = ctx;

  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for") ??
    "0.0.0.0";
  const ipHash = await hashIp(ip, (env.IP_HASH_SALT as string) ?? "");
  if (await isRateLimited(env as Env, ipHash)) {
    return json({ error: "rate_limited" }, 429);
  }

  let body: ReqBody;
  try {
    body = (await request.json()) as ReqBody;
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  if (!body.email) return json({ error: "bad_request" }, 400);
  if (!body.code) return json({ error: "bad_request" }, 400);

  const secret = (env.IP_HASH_SALT as string) ?? "";
  const sessionId = await readSessionCookie(
    request.headers.get("cookie"),
    secret,
  );
  if (!sessionId) return json({ error: "missing_session" }, 400);

  const result = await verifyOtp(env as Env, {
    sessionId,
    email: body.email,
    code: body.code,
  });

  if (!result.ok) {
    if (result.error === "expired") return json({ error: result.error }, 410);
    if (result.error === "too_many_attempts") {
      return json({ error: result.error }, 429);
    }
    if (result.error === "no_pending_code" || result.error === "invalid_code") {
      return json({ error: result.error }, 400);
    }
    return json({ error: result.error }, 500);
  }

  // Refresh the cookie (extends Max-Age now that it's a verified session).
  const cookie = await serializeSessionCookie(sessionId, secret);
  return new Response(
    JSON.stringify({ ok: true, verifiedEmail: result.verifiedEmail }),
    {
      status: 200,
      headers: { "content-type": "application/json", "set-cookie": cookie },
    },
  );
};
