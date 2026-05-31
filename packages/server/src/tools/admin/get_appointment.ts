/**
 * get_appointment — one appointment plus its reschedule/cancel/status history
 * (appointment_events). Use for review before a reschedule or status change.
 *
 * category 'read'.
 */
import { z } from "zod";
import type { AppointmentRow, AppointmentEventRow } from "@drkyana/types";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";
import { fetchAppointment, fetchAppointmentEvents } from "./appointments_shared";

const inputSchema = z.object({
  id: z.string().min(1).describe("The appointment id."),
});

/** Appointment plus the patient's human-readable name/phone for replies. */
export interface AppointmentWithPatient extends AppointmentRow {
  patientName: string | null;
  patientPhone: string | null;
}

export const getAppointmentTool = defineTool({
  name: "get_appointment",
  description:
    "Fetch one appointment by id plus its full event history (created, " +
    "rescheduled, confirmed, cancelled, completed, no_show) and the patient's " +
    "name + phone. Refer to the appointment by the patient's name in replies, " +
    "not the raw id.",
  category: "read",
  inputSchema,
  async execute(
    args,
    ctx: AgentContext,
  ): Promise<
    | { appointment: AppointmentWithPatient; events: AppointmentEventRow[] }
    | { appointment: null }
  > {
    assertAdmin(ctx);
    const appointment = await fetchAppointment(ctx.env, args.id);
    if (!appointment) return { appointment: null };
    const patient = await ctx.env.DB.prepare(
      "SELECT name, phone FROM patients WHERE id = ?",
    )
      .bind(appointment.patient_id)
      .first<{ name: string | null; phone: string | null }>();
    const events = await fetchAppointmentEvents(ctx.env, args.id);
    return {
      appointment: {
        ...appointment,
        patientName: patient?.name ?? null,
        patientPhone: patient?.phone ?? null,
      },
      events,
    };
  },
});
