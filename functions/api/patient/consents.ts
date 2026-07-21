/**
 * Patient consent — GET / POST /api/patient/consents
 *
 * PDPA 2026 requires that consent be as easy to withdraw as it was to give, so
 * withdrawal has to be a real, reachable operation — not a policy sentence.
 *
 * GET  → the current state of every scope for the signed-in patient.
 * POST { scope, action: "withdraw" | "grant" } → change one scope.
 *
 * Identity comes ONLY from the signed httpOnly session cookie → the session's
 * verified_email, exactly as /api/patient/records does. A caller can therefore
 * only ever read or change their own consent.
 *
 * Withdrawing `ai_inference` takes effect on the very next turn: the patient
 * agent endpoint checks hasConsent() per request, so the receptionist stops
 * immediately rather than at the next session.
 *
 * Returns:
 *   200 { verified: false }                       — no/invalid cookie or unverified session
 *   200 { verified: true, policyVersion, consents: [...] }
 *   400 { error: "bad_request" | "unknown_scope" }
 *   429 { error: "rate_limited" }
 */
import {
  readSessionCookie,
  listConsents,
  withdrawConsent,
  buildConsentInserts,
  type Env,
} from "@drkyana/server";
import { CONSENT_POLICY_VERSION, type ConsentScope } from "@drkyana/types";

interface PagesContext {
  request: Request;
  env: Record<string, unknown> & Partial<Env>;
}

const KNOWN_SCOPES: readonly ConsentScope[] = [
  "care",
  "ai_inference",
  "email",
  "mcp_third_party",
];

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
  const key = `consents:${ipHash}`;
  const current = Number((await env.KV.get(key, "text")) ?? "0");
  if (current >= RATE_LIMIT) return true;
  await env.KV.put(key, String(current + 1), {
    expirationTtl: RATE_WINDOW_SECONDS,
  });
  return false;
}

/** Resolve the caller's verified email from the cookie, or null. */
async function verifiedEmailFor(
  request: Request,
  env: Env,
  secret: string,
): Promise<{ sessionId: string; email: string } | null> {
  const sessionId = await readSessionCookie(request.headers.get("cookie"), secret);
  if (!sessionId) return null;
  const row = await env.DB.prepare("SELECT verified_email FROM sessions WHERE id = ?")
    .bind(sessionId)
    .first<{ verified_email: string | null }>();
  if (!row?.verified_email) return null;
  return { sessionId, email: row.verified_email };
}

export const onRequestGet = async (ctx: PagesContext): Promise<Response> => {
  const { request, env } = ctx;
  const secret = (env.IP_HASH_SALT as string) ?? "";
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for") ??
    "0.0.0.0";
  const ipHash = await hashIp(ip, secret);
  if (await isRateLimited(env as Env, ipHash)) return json({ error: "rate_limited" }, 429);

  const who = await verifiedEmailFor(request, env as Env, secret);
  if (!who) return json({ verified: false }, 200);

  return json(
    {
      verified: true,
      policyVersion: CONSENT_POLICY_VERSION,
      consents: await listConsents(env as Env, who.email),
    },
    200,
  );
};

export const onRequestPost = async (ctx: PagesContext): Promise<Response> => {
  const { request, env } = ctx;
  const secret = (env.IP_HASH_SALT as string) ?? "";
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for") ??
    "0.0.0.0";
  const ipHash = await hashIp(ip, secret);
  if (await isRateLimited(env as Env, ipHash)) return json({ error: "rate_limited" }, 429);

  let body: { scope?: string; action?: string; locale?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const scope = body.scope as ConsentScope | undefined;
  if (!scope || !KNOWN_SCOPES.includes(scope)) return json({ error: "unknown_scope" }, 400);
  if (body.action !== "withdraw" && body.action !== "grant") {
    return json({ error: "bad_request" }, 400);
  }

  const who = await verifiedEmailFor(request, env as Env, secret);
  if (!who) return json({ verified: false }, 200);

  if (body.action === "withdraw") {
    await withdrawConsent(env as Env, who.email, scope);
  } else {
    // Re-granting inserts a NEW row rather than clearing withdrawn_at, so the
    // withdrawal stays on the record — that history is the point of the table.
    const stmts = await buildConsentInserts(env as Env, {
      sessionId: who.sessionId,
      email: who.email,
      locale: body.locale ?? "en",
      ipHash,
      scopes: [scope],
    });
    await (env as Env).DB.batch(stmts);
  }

  return json(
    {
      verified: true,
      policyVersion: CONSENT_POLICY_VERSION,
      consents: await listConsents(env as Env, who.email),
    },
    200,
  );
};
