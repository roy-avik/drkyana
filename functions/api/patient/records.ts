/**
 * Patient records — GET /api/patient/records
 *
 * Returns the signed-in patient's own appointments and approved/sent
 * prescriptions for the dedicated /account page. Read-only.
 *
 * Identity is resolved ONLY from the signed httpOnly session cookie → the
 * session's verified_email → the matching email-verified `patients` row. It is
 * never taken from query params, so a caller can only ever see their own
 * records (the patient-side analogue of assertOwnPatient).
 *
 * Returns:
 *   200 { verified: false }                                   — no/invalid cookie or unverified session
 *   200 { verified: true, patient: null, appointments: [], prescriptions: [] } — verified, but no record yet (first-timer)
 *   200 { verified: true, patient: {...}, appointments: [...], prescriptions: [...] }
 *   429 { error: "rate_limited" }
 */
import { readSessionCookie, type Env } from "@drkyana/server";

interface PagesContext {
  request: Request;
  env: Record<string, unknown> & Partial<Env>;
}

interface ApptOut {
  id: string;
  scheduledAt: number;
  durationMin: number;
  status: string;
  note: string | null;
  chamberName: string | null;
  chamberArea: string | null;
}

interface RxOut {
  id: string;
  title: string | null;
  markdown: string;
  status: string;
  createdAt: number;
}

const RATE_LIMIT = 60; // requests
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

async function isRateLimited(env: Env, ipHash: string): Promise<boolean> {
  const key = `records:${ipHash}`;
  const current = Number((await env.KV.get(key, "text")) ?? "0");
  if (current >= RATE_LIMIT) return true;
  await env.KV.put(key, String(current + 1), {
    expirationTtl: RATE_WINDOW_SECONDS,
  });
  return false;
}

export const onRequestGet = async (ctx: PagesContext): Promise<Response> => {
  const { request, env } = ctx;
  const secret = (env.IP_HASH_SALT as string) ?? "";

  // --- Rate limit (per hashed IP) ---
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for") ??
    "0.0.0.0";
  const ipHash = await hashIp(ip, secret);
  if (await isRateLimited(env as Env, ipHash)) {
    return json({ error: "rate_limited" }, 429);
  }

  // --- Session id from the signed httpOnly cookie (never from input) ---
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

  // --- Resolve the patient by their VERIFIED email (email-verified rows only) ---
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

  if (!patient) {
    // Verified email, but no record yet — a first-time visitor.
    return json(
      { verified: true, patient: null, appointments: [], prescriptions: [] },
      200,
    );
  }

  // --- Appointments (most recent first), with chamber name/area if linked ---
  const apptRows = await db
    .prepare(
      "SELECT a.id, a.scheduled_at, a.duration_min, a.status, a.note, " +
        "c.name AS chamber_name, c.area AS chamber_area " +
        "FROM appointments a LEFT JOIN chambers c ON a.chamber_id = c.id " +
        "WHERE a.patient_id = ? ORDER BY a.scheduled_at DESC LIMIT 50",
    )
    .bind(patient.id)
    .all<{
      id: string;
      scheduled_at: number;
      duration_min: number;
      status: string;
      note: string | null;
      chamber_name: string | null;
      chamber_area: string | null;
    }>();

  const appointments: ApptOut[] = (apptRows.results ?? []).map((r) => ({
    id: r.id,
    scheduledAt: r.scheduled_at,
    durationMin: r.duration_min,
    status: r.status,
    note: r.note ?? null,
    chamberName: r.chamber_name ?? null,
    chamberArea: r.chamber_area ?? null,
  }));

  // --- Prescriptions the dentist has reviewed (approved | sent), newest first.
  //     'draft' rows stay hidden — the patient never sees an unreviewed draft. ---
  const rxRows = await db
    .prepare(
      "SELECT id, title, markdown, status, created_at FROM drafts " +
        "WHERE patient_id = ? AND type = 'prescription' " +
        "AND status IN ('approved', 'sent') ORDER BY created_at DESC LIMIT 50",
    )
    .bind(patient.id)
    .all<{
      id: string;
      title: string | null;
      markdown: string;
      status: string;
      created_at: number;
    }>();

  const prescriptions: RxOut[] = (rxRows.results ?? []).map((r) => ({
    id: r.id,
    title: r.title ?? null,
    markdown: r.markdown ?? "",
    status: r.status,
    createdAt: r.created_at,
  }));

  return json(
    {
      verified: true,
      patient: {
        name: patient.name ?? null,
        visitCount: Number(patient.visit_count ?? 0),
        lastVisit: patient.last_visit ?? null,
      },
      appointments,
      prescriptions,
    },
    200,
  );
};
