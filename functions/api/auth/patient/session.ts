/**
 * Patient session restore — GET /api/auth/patient/session
 *
 * Reads the signed httpOnly session cookie and reports whether this browser
 * already has a VERIFIED session, plus the stored chat history so a refresh
 * lands the patient straight back in the conversation (no re-verify, no lost
 * transcript).
 *
 * Returns:
 *   200 { verified: false }                              — no/invalid cookie, or not yet verified
 *   200 { verified: true, email, messages: UIMessage[] } — verified session
 *
 * No body, no mutation. The cookie is the only input; the email + messages come
 * from the `sessions` row keyed by the cookie's session id.
 */
import { readSessionCookie, type Env } from "@drkyana/server";
import type { UIMessage } from "ai";

interface PagesContext {
  request: Request;
  env: Record<string, unknown> & Partial<Env>;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const onRequestGet = async (ctx: PagesContext): Promise<Response> => {
  const { request, env } = ctx;
  const sessionId = await readSessionCookie(
    request.headers.get("cookie"),
    (env.IP_HASH_SALT as string) ?? "",
  );
  if (!sessionId) return json({ verified: false }, 200);

  const row = await (env as Env).DB.prepare(
    "SELECT verified_email, messages FROM sessions WHERE id = ?",
  )
    .bind(sessionId)
    .first<{ verified_email: string | null; messages: string | null }>();

  if (!row?.verified_email) return json({ verified: false }, 200);

  let messages: UIMessage[] = [];
  if (row.messages) {
    try {
      const parsed = JSON.parse(row.messages);
      if (Array.isArray(parsed)) messages = parsed as UIMessage[];
    } catch {
      messages = [];
    }
  }

  return json({ verified: true, email: row.verified_email, messages }, 200);
};
