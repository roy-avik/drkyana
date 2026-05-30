/**
 * Patient email OTP — request a code.
 *
 * Route: POST /api/auth/patient/email/request
 * Body: { sessionId: string; email: string; locale?: "en"|"fa"|"bn" }
 * Returns:
 *   200 { ok: true }
 *   400 { error: "bad_request" | "missing_session" | "bad_email" }
 *   429 { error: "rate_limited" | "rate_limit_email" | "rate_limit_ip" }
 *   500 { error: "send_failed" }
 *
 * The endpoint is public (matches /api/agent/patient). Abuse is gated by:
 *   - a coarse per-IP KV rate limit at the HTTP layer (cheap),
 *   - tighter per-email + per-IP D1 counts INSIDE mail_otp.requestOtp.
 */
import { requestOtp, type Env } from "@drkyana/server";
import type { Locale } from "@drkyana/types";

interface PagesContext {
  request: Request;
  env: Record<string, unknown> & Partial<Env>;
}

interface ReqBody {
  sessionId?: string;
  email?: string;
  locale?: Locale;
}

const RATE_LIMIT = 20;
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
  const key = `otp_req:${ipHash}`;
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

  if (!body.sessionId) return json({ error: "missing_session" }, 400);
  if (!body.email) return json({ error: "bad_email" }, 400);

  const result = await requestOtp(env as Env, {
    sessionId: body.sessionId,
    email: body.email,
    ipHash,
    locale: body.locale ?? "en",
  });

  if (!result.ok) {
    if (result.error === "bad_email") return json({ error: result.error }, 400);
    if (result.error === "rate_limit_email" || result.error === "rate_limit_ip") {
      return json({ error: result.error }, 429);
    }
    return json({ error: result.error }, 500);
  }
  return json({ ok: true }, 200);
};
