/**
 * Shared appointment helpers — D1 row fetch/map + event recording, reused by
 * the appointment admin tools and (mirrored) by the admin app's direct CRUD.
 * Server-only; all reads/writes are parameterized.
 */
import type {
  AppointmentRow,
  AppointmentStatus,
  AppointmentEventType,
  AppointmentEventDetail,
  AppointmentEventRow,
} from "@drkyana/types";
import type { Env } from "../../bindings";

export const APPOINTMENT_STATUSES: AppointmentStatus[] = [
  "proposed",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
];

export function mapAppointment(r: Record<string, unknown>): AppointmentRow {
  return {
    id: String(r.id),
    patient_id: String(r.patient_id),
    intake_id: (r.intake_id as string | null) ?? null,
    chamber_id: (r.chamber_id as string | null) ?? null,
    scheduled_at: Number(r.scheduled_at ?? 0),
    duration_min: Number(r.duration_min ?? 30),
    status: (r.status as AppointmentStatus) ?? "proposed",
    note: (r.note as string | null) ?? null,
    created_at: Number(r.created_at ?? 0),
    updated_at: Number(r.updated_at ?? 0),
  };
}

function parseDetail(raw: unknown): AppointmentEventDetail {
  if (typeof raw !== "string" || raw === "") return {};
  try {
    return JSON.parse(raw) as AppointmentEventDetail;
  } catch {
    return {};
  }
}

export function mapAppointmentEvent(
  r: Record<string, unknown>,
): AppointmentEventRow {
  return {
    id: String(r.id),
    appointment_id: String(r.appointment_id),
    type: (r.type as AppointmentEventType) ?? "created",
    detail: parseDetail(r.detail),
    actor: (r.actor as string | null) ?? null,
    at: Number(r.at ?? 0),
  };
}

export async function fetchAppointment(
  env: Env,
  id: string,
): Promise<AppointmentRow | null> {
  const row = await env.DB.prepare("SELECT * FROM appointments WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  return row ? mapAppointment(row) : null;
}

export async function fetchAppointmentEvents(
  env: Env,
  appointmentId: string,
): Promise<AppointmentEventRow[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM appointment_events WHERE appointment_id = ? ORDER BY at ASC",
  )
    .bind(appointmentId)
    .all<Record<string, unknown>>();
  return (results ?? []).map(mapAppointmentEvent);
}

/** Insert one immutable history row. `actor` is the verified admin email. */
export async function recordAppointmentEvent(
  env: Env,
  args: {
    appointmentId: string;
    type: AppointmentEventType;
    detail?: AppointmentEventDetail;
    actor?: string | null;
    at: number;
  },
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO appointment_events (id, appointment_id, type, detail, actor, at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(
      crypto.randomUUID(),
      args.appointmentId,
      args.type,
      args.detail ? JSON.stringify(args.detail) : null,
      args.actor ?? null,
      args.at,
    )
    .run();
}
