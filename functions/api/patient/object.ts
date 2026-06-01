/**
 * Patient Object — GET /api/patient/object
 *
 * Returns the signed-in patient's own identity object (id + name) so the client
 * can resolve the receptionist's PATIENT_NAME_TOKEN to the real name for display
 * and pre-fill the intake form. This is the ONLY surface that releases the name
 * to the client, and only to the authenticated owner of the record.
 *
 * Identity is resolved ONLY from the signed httpOnly session cookie → the
 * session's verified_email → the matching email-verified `patients` row. The id
 * is a reference, never a credential — authorization is by session, not by any
 * client-supplied id (mirrors functions/api/patient/records.ts).
 *
 * Returns:
 *   200 { verified: false }                       — no/invalid cookie or unverified session
 *   200 { verified: true, patient: null }         — verified, but no record yet (first-timer)
 *   200 { verified: true, patient: { id, name, visitCount, lastVisit } }
 */
import { readSessionCookie, type Env } from "@drkyana/server";

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
  const secret = (env.IP_HASH_SALT as string) ?? "";

  const sessionId = await readSessionCookie(
    request.headers.get("cookie"),
    secret,
  );
  if (!sessionId) return json({ verified: false }, 200);

  const db = (env as Env).DB;

  const sessionRow = await db
    .prepare("SELECT verified_email FROM sessions WHERE id = ?")
    .bind(sessionId)
    .first<{ verified_email: string | null }>();
  if (!sessionRow?.verified_email) return json({ verified: false }, 200);

  const patient = await db
    .prepare(
      "SELECT id, name, visit_count, last_visit FROM patients " +
        "WHERE email = ? AND email_verified_at IS NOT NULL",
    )
    .bind(sessionRow.verified_email)
    .first<{
      id: string;
      name: string | null;
      visit_count: number | null;
      last_visit: number | null;
    }>();

  if (!patient) return json({ verified: true, patient: null }, 200);

  return json(
    {
      verified: true,
      patient: {
        id: patient.id,
        name: patient.name ?? null,
        visitCount: Number(patient.visit_count ?? 0),
        lastVisit: patient.last_visit ?? null,
      },
    },
    200,
  );
};
