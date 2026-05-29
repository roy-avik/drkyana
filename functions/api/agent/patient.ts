/**
 * Patient agent endpoint — Cloudflare Pages Function (server-side execution
 * context; importing @drkyana/server is allowed here per the isolation guard).
 *
 * Route: POST /api/agent/patient
 *
 * Responsibilities (Phase 1A):
 *   - validate the PATIENT_AGENT_TOKEN bearer/header,
 *   - per-IP KV rate limit (IP hashed with IP_HASH_SALT — never store raw IPs),
 *   - build a patient AgentContext (caller.kind = "patient", waitUntil from the
 *     Pages context, env mapped to the @drkyana/server Env type),
 *   - load/persist the chat session history in D1 keyed by sessionId,
 *   - convert the incoming UI messages to model messages and run the patient
 *     agent, returning its AI SDK UI message stream Response.
 *
 * NO admin tools, NO secrets reach the client — only the stream surfaces
 * non-sensitive tool names/states.
 */
import {
  patientAgentSpec,
  streamAgent,
  type AgentContext,
  type Env,
} from "@drkyana/server";
import { convertToModelMessages, type UIMessage } from "ai";
import type { Locale } from "@drkyana/types";

// Cloudflare Pages Functions context (subset we use). The platform injects the
// real bindings; we map them onto the server package's `Env` shape.
interface PagesContext {
  request: Request;
  env: Record<string, unknown> & Partial<Env>;
  waitUntil(p: Promise<unknown>): void;
}

interface PatientChatBody {
  sessionId?: string;
  id?: string;
  messages?: UIMessage[];
  locale?: Locale;
}

const RATE_LIMIT = 30; // requests
const RATE_WINDOW_SECONDS = 60; // per minute, per IP

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

/** Returns true if the caller is over the per-IP limit. */
async function isRateLimited(env: Env, ipHash: string): Promise<boolean> {
  const key = `rate:${ipHash}`;
  const current = Number((await env.KV.get(key, "text")) ?? "0");
  if (current >= RATE_LIMIT) return true;
  await env.KV.put(key, String(current + 1), {
    expirationTtl: RATE_WINDOW_SECONDS,
  });
  return false;
}

/** Load stored UI messages for a patient session from D1 (empty if none). */
async function loadSessionMessages(
  env: Env,
  sessionId: string,
): Promise<UIMessage[]> {
  const row = await env.DB.prepare(
    "SELECT messages FROM sessions WHERE id = ?",
  )
    .bind(sessionId)
    .first<{ messages: string }>();
  if (!row?.messages) return [];
  try {
    const parsed = JSON.parse(row.messages);
    return Array.isArray(parsed) ? (parsed as UIMessage[]) : [];
  } catch {
    return [];
  }
}

/** Upsert the session's UI message history + metadata in D1. */
async function saveSessionMessages(
  env: Env,
  sessionId: string,
  messages: UIMessage[],
  locale: Locale,
  ipHash: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT INTO sessions (id, kind, messages, locale, ip_hash, created_at, updated_at) " +
      "VALUES (?, 'patient', ?, ?, ?, ?, ?) " +
      "ON CONFLICT(id) DO UPDATE SET messages = excluded.messages, " +
      "locale = excluded.locale, updated_at = excluded.updated_at",
  )
    .bind(sessionId, JSON.stringify(messages), locale, ipHash, now, now)
    .run();
}

/** Merge stored + incoming UI messages, de-duplicating by message id. */
function mergeById(stored: UIMessage[], incoming: UIMessage[]): UIMessage[] {
  const byId = new Map<string, UIMessage>();
  for (const m of stored) if (m?.id) byId.set(m.id, m);
  for (const m of incoming) if (m?.id) byId.set(m.id, m);
  // Preserve order: stored first, then any new incoming ids.
  const order: UIMessage[] = [];
  const seen = new Set<string>();
  for (const m of [...stored, ...incoming]) {
    if (!m?.id || seen.has(m.id)) continue;
    seen.add(m.id);
    order.push(byId.get(m.id)!);
  }
  return order;
}

export const onRequestPost = async (ctx: PagesContext): Promise<Response> => {
  const { request, env } = ctx;

  // Public endpoint: the previous token gate was a client-bundled token (shipped
  // in the browser), so it offered no real protection. Abuse is controlled by the
  // per-IP KV rate limit below; add Cloudflare Turnstile if stronger protection
  // is needed later.

  // --- Rate limit (per hashed IP) ---
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for") ??
    "0.0.0.0";
  const ipHash = await hashIp(ip, env.IP_HASH_SALT ?? "");
  if (await isRateLimited(env as Env, ipHash)) {
    return json({ error: "rate_limited" }, 429);
  }

  // --- Parse body ---
  let body: PatientChatBody;
  try {
    body = (await request.json()) as PatientChatBody;
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const sessionId = body.sessionId ?? body.id;
  if (!sessionId) return json({ error: "missing_session" }, 400);
  const locale: Locale = body.locale ?? "en";
  const incoming = Array.isArray(body.messages) ? body.messages : [];

  // --- Session history (D1) ---
  const stored = await loadSessionMessages(env as Env, sessionId);
  const merged = mergeById(stored, incoming);

  // --- Build patient context ---
  const agentCtx: AgentContext = {
    env: env as Env,
    caller: { kind: "patient", sessionId, ipHash },
    locale,
    abortSignal: request.signal,
    waitUntil: (p) => ctx.waitUntil(p),
  };

  // Persist the session row BEFORE streaming (awaited, not waitUntil): tools
  // like submit_intake link this session to the resolved patient with an
  // in-stream UPDATE, which would no-op if the row didn't exist yet. waitUntil
  // runs after the response — too late for that UPDATE.
  await saveSessionMessages(env as Env, sessionId, merged, locale, ipHash);

  // --- Run the patient agent → UI message stream Response ---
  // convertToModelMessages is async in AI SDK 6 — must await, else a Promise is
  // passed as `messages` and streamText throws "messages.some is not a function".
  const history = await convertToModelMessages(merged);
  return streamAgent(patientAgentSpec, agentCtx, history);
};
