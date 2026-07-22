/**
 * Scheduled reminders (server-only). A plain async function the ops Worker's
 * ReminderWorkflow calls on its cron (and the Access-gated POST /api/cron/
 * reminders route still exposes for on-demand runs). NOT streamed, no model in
 * the loop: it queries D1 and emails Dr Kyana a compact digest via `sendEmail`.
 *
 * WHAT CHANGED (Phase 0.4): the original version only queried `intakes`, because
 * it was written before migration 0002 added the `appointments` table — so it
 * could never actually remind about a booked appointment. It now leads with
 * upcoming appointments (the real scheduling signal) and keeps the urgent-
 * uncontacted-intake list as a safety net (a RED/ORANGE intake with no
 * appointment yet is exactly what must not slip).
 *
 * AUDIENCE: the digest goes to Dr Kyana (DR_KYANA_NOTIFY_EMAIL), not to
 * patients. Patient-facing appointment reminders wait for the verified
 * send-to-any-recipient email path (Phase 0.2 / A1) — the cloudflare:email
 * binding today only reaches verified destinations.
 *
 * Best-effort: a failed send is logged into the result, never thrown — the
 * scheduled run must not hard-fail on a transient email error.
 */
import type { Env } from "../bindings";
import { sendEmail } from "../email";

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

/** How far ahead to surface appointments (the next two days). */
const APPOINTMENT_HORIZON_SECONDS = 2 * DAY;
/** How far back an urgent intake stays on the "still uncontacted" list. */
const URGENT_LOOKBACK_SECONDS = 3 * DAY;
/** Cap each section so a backlog can't produce an unbounded email. */
const SECTION_LIMIT = 50;

export interface AppointmentReminder {
  kind: "appointment";
  appointmentId: string;
  scheduledAt: number;
  status: string;
  patientName: string | null;
  patientPhone: string | null;
  chamberName: string | null;
  chamberArea: string | null;
}

export interface UrgentIntakeReminder {
  kind: "urgent_intake";
  intakeId: string;
  name: string | null;
  phone: string | null;
  triageLevel: string | null;
  createdAt: number;
}

export type ReminderItem = AppointmentReminder | UrgentIntakeReminder;

export interface ReminderRunResult {
  considered: number;
  appointments: number;
  urgentIntakes: number;
  emailed: boolean;
  error?: string;
}

interface RawAppointmentRow {
  id: string;
  scheduled_at: number;
  status: string;
  patient_name: string | null;
  patient_phone: string | null;
  chamber_name: string | null;
  chamber_area: string | null;
}

interface RawUrgentRow {
  id: string;
  name: string | null;
  phone: string | null;
  triage_level: string | null;
  created_at: number;
}

/**
 * Upcoming appointments to prepare/confirm: proposed or confirmed, with a slot
 * inside the forward horizon. Joined to the patient (name/phone) and, when set,
 * the chamber (name/area). `now` is injectable for deterministic tests.
 */
export async function selectUpcomingAppointments(
  env: Env,
  now: number = Math.floor(Date.now() / 1000),
): Promise<AppointmentReminder[]> {
  const { results } = await env.DB.prepare(
    "SELECT a.id, a.scheduled_at, a.status, " +
      "p.name AS patient_name, p.phone AS patient_phone, " +
      "c.name AS chamber_name, c.area AS chamber_area " +
      "FROM appointments a " +
      "JOIN patients p ON p.id = a.patient_id " +
      "LEFT JOIN chambers c ON c.id = a.chamber_id " +
      "WHERE a.status IN ('proposed','confirmed') " +
      "AND a.scheduled_at >= ? AND a.scheduled_at < ? " +
      "ORDER BY a.scheduled_at ASC LIMIT ?",
  )
    .bind(now, now + APPOINTMENT_HORIZON_SECONDS, SECTION_LIMIT)
    .all<RawAppointmentRow>();

  return (results ?? []).map((r) => ({
    kind: "appointment" as const,
    appointmentId: r.id,
    scheduledAt: r.scheduled_at,
    status: r.status,
    patientName: r.patient_name,
    patientPhone: r.patient_phone,
    chamberName: r.chamber_name,
    chamberArea: r.chamber_area,
  }));
}

/**
 * Urgent intakes that are still uncontacted: RED/ORANGE, status 'new', created
 * within the lookback window. This is the safety net the old reminder existed
 * for and is orthogonal to appointments — an urgent intake with no appointment
 * yet is the case most likely to slip.
 */
export async function selectUrgentIntakes(
  env: Env,
  now: number = Math.floor(Date.now() / 1000),
): Promise<UrgentIntakeReminder[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, name, phone, triage_level, created_at FROM intakes " +
      "WHERE status = 'new' AND triage_level IN ('RED','ORANGE') AND created_at >= ? " +
      "ORDER BY CASE triage_level WHEN 'RED' THEN 0 WHEN 'ORANGE' THEN 1 ELSE 2 END, created_at DESC " +
      "LIMIT ?",
  )
    .bind(now - URGENT_LOOKBACK_SECONDS, SECTION_LIMIT)
    .all<RawUrgentRow>();

  return (results ?? []).map((r) => ({
    kind: "urgent_intake" as const,
    intakeId: r.id,
    name: r.name,
    phone: r.phone,
    triageLevel: r.triage_level,
    createdAt: r.created_at,
  }));
}

/** Both reminder signals, appointments first. `now` injectable for tests. */
export async function selectReminders(
  env: Env,
  now: number = Math.floor(Date.now() / 1000),
): Promise<ReminderItem[]> {
  const [appts, urgent] = await Promise.all([
    selectUpcomingAppointments(env, now),
    selectUrgentIntakes(env, now),
  ]);
  return [...appts, ...urgent];
}

function fmtSlot(unixSeconds: number): string {
  // Dhaka is UTC+6, fixed (no DST) — safe to format the digest in local time.
  const d = new Date((unixSeconds + 6 * HOUR) * 1000);
  const date = d.toISOString().slice(0, 10);
  const time = d.toISOString().slice(11, 16);
  return `${date} ${time} (Dhaka)`;
}

function buildDigestBody(items: ReminderItem[]): string {
  const appts = items.filter((i): i is AppointmentReminder => i.kind === "appointment");
  const urgent = items.filter((i): i is UrgentIntakeReminder => i.kind === "urgent_intake");
  const lines: string[] = ["Daily clinic reminders from your receptionist.", ""];

  if (appts.length) {
    lines.push(`Upcoming appointments (${appts.length}):`);
    for (const a of appts) {
      const where = a.chamberName ? ` @ ${a.chamberName}${a.chamberArea ? `, ${a.chamberArea}` : ""}` : "";
      lines.push(
        `  • ${fmtSlot(a.scheduledAt)} — ${a.patientName ?? "Unknown"}` +
          `${a.patientPhone ? ` (${a.patientPhone})` : ""}${where} [${a.status}]`,
      );
    }
    lines.push("");
  }

  if (urgent.length) {
    lines.push(`Urgent — still uncontacted (${urgent.length}):`);
    for (const u of urgent) {
      lines.push(
        `  • [${u.triageLevel}] ${u.name ?? "Unknown"}` +
          `${u.phone ? ` — ${u.phone}` : ""} (intake ${u.intakeId})`,
      );
    }
    lines.push("");
  }

  lines.push("Open the practice console to act on these.");
  return lines.join("\n");
}

/**
 * Run the reminder pass: select actionable items and email Dr Kyana a digest.
 * No-op (no email) when there's nothing to remind about. Never throws.
 */
export async function runReminders(
  env: Env,
  now: number = Math.floor(Date.now() / 1000),
): Promise<ReminderRunResult> {
  let items: ReminderItem[];
  try {
    items = await selectReminders(env, now);
  } catch (e) {
    return {
      considered: 0,
      appointments: 0,
      urgentIntakes: 0,
      emailed: false,
      error: e instanceof Error ? e.message : "query failed",
    };
  }

  const appointments = items.filter((i) => i.kind === "appointment").length;
  const urgentIntakes = items.length - appointments;

  if (items.length === 0) {
    return { considered: 0, appointments: 0, urgentIntakes: 0, emailed: false };
  }

  const to = env.DR_KYANA_NOTIFY_EMAIL;
  if (!to) {
    return { considered: items.length, appointments, urgentIntakes, emailed: false, error: "no notify address" };
  }

  const res = await sendEmail(env, {
    to,
    subject: `Clinic reminders — ${items.length} item${items.length === 1 ? "" : "s"}`,
    body: buildDigestBody(items),
  });

  return {
    considered: items.length,
    appointments,
    urgentIntakes,
    emailed: res.ok,
    error: res.ok ? undefined : res.error,
  };
}
