import "server-only";
import {
  adminAgentSpec,
  streamAgent,
  type AgentContext,
  type Env,
} from "@drkyana/server";
import { convertToModelMessages, type UIMessage } from "ai";
import type { Locale } from "@drkyana/types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { verifyAccess, AccessDeniedError } from "@/server/access";

/**
 * Admin agent endpoint (server-only). Cloudflare Access fronts the whole app;
 * we re-verify the Access JWT here and build an admin AgentContext from it
 * (caller never trusts model/body args for identity).
 *
 * Mirrors the patient endpoint's session pattern: load prior UI messages from
 * D1 `sessions` keyed by sessionId, merge with the incoming messages, persist,
 * then stream the admin agent's UI message stream Response for `useChat`.
 */

interface AdminChatBody {
  sessionId?: string;
  id?: string;
  messages?: UIMessage[];
  locale?: Locale;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function loadSessionMessages(env: Env, sessionId: string): Promise<UIMessage[]> {
  const row = await env.DB.prepare("SELECT messages FROM sessions WHERE id = ?")
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

async function saveSessionMessages(
  env: Env,
  sessionId: string,
  messages: UIMessage[],
  locale: Locale,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT INTO sessions (id, kind, messages, locale, created_at, updated_at) " +
      "VALUES (?, 'admin', ?, ?, ?, ?) " +
      "ON CONFLICT(id) DO UPDATE SET messages = excluded.messages, " +
      "locale = excluded.locale, updated_at = excluded.updated_at",
  )
    .bind(sessionId, JSON.stringify(messages), locale, now, now)
    .run();
}

function mergeById(stored: UIMessage[], incoming: UIMessage[]): UIMessage[] {
  const byId = new Map<string, UIMessage>();
  for (const m of stored) if (m?.id) byId.set(m.id, m);
  for (const m of incoming) if (m?.id) byId.set(m.id, m);
  const order: UIMessage[] = [];
  const seen = new Set<string>();
  for (const m of [...stored, ...incoming]) {
    if (!m?.id || seen.has(m.id)) continue;
    seen.add(m.id);
    order.push(byId.get(m.id)!);
  }
  return order;
}

export async function POST(req: Request): Promise<Response> {
  // --- Auth (verified Access JWT → admin identity) ---
  let identity;
  try {
    identity = await verifyAccess(req);
  } catch (err) {
    const status = err instanceof AccessDeniedError ? err.status : 401;
    return json({ error: "unauthorized", detail: (err as Error).message }, status);
  }

  const { env: cfEnv, ctx } = getCloudflareContext();
  const env = cfEnv as unknown as Env;

  // --- Parse body ---
  let body: AdminChatBody;
  try {
    body = (await req.json()) as AdminChatBody;
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const sessionId = body.sessionId ?? body.id;
  if (!sessionId) return json({ error: "missing_session" }, 400);
  const locale: Locale = body.locale ?? "en";
  const incoming = Array.isArray(body.messages) ? body.messages : [];

  // --- Session history (D1) ---
  const stored = await loadSessionMessages(env, sessionId);
  const merged = mergeById(stored, incoming);

  // --- Build admin context (identity from JWT, not from body) ---
  const agentCtx: AgentContext = {
    env,
    caller: { kind: "admin", email: identity.email, accessSub: identity.sub },
    locale,
    abortSignal: req.signal,
    waitUntil: (p) => ctx.waitUntil(p),
  };

  // Persist the request-side history immediately. This guarantees the session
  // row exists for any in-stream tool that updates it. The assistant turn is
  // persisted again in the `onFinish` hook below — the full thread (original +
  // new assistant turn including tool calls) is what survives a reload.
  ctx.waitUntil(saveSessionMessages(env, sessionId, merged, locale));

  // --- Run the admin agent → UI message stream Response ---
  const history = await convertToModelMessages(merged);
  return streamAgent(adminAgentSpec, agentCtx, history, {
    originalMessages: merged,
    onFinish: ({ messages }) => {
      // `messages` is the full updated thread (per AI SDK 6 persistence mode).
      // Upsert without blocking the response — the client has already received
      // the stream; this is just durability.
      ctx.waitUntil(saveSessionMessages(env, sessionId, messages, locale));
    },
  });
}
