/**
 * list_appointments — admin read of scheduled/proposed visits, filtered by
 * patient, status, and a scheduled-at window. Returns COMPACT rows ordered by
 * scheduled time. Use get_appointment for one record + its history.
 *
 * category 'read'.
 */
import { z } from "zod";
import type { AppointmentRow, AppointmentStatus } from "@drkyana/types";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";
import { mapAppointment } from "./appointments_shared";

const statusEnum = z.enum([
  "proposed",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
]);

const inputSchema = z.object({
  patientId: z.string().optional().describe("Filter to one patient's appointments."),
  status: statusEnum.optional().describe("Filter by appointment status."),
  from: z
    .number()
    .int()
    .optional()
    .describe("Unix epoch seconds — only appointments scheduled at/after this."),
  to: z
    .number()
    .int()
    .optional()
    .describe("Unix epoch seconds — only appointments scheduled at/before this."),
  limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 25)."),
});

export interface AppointmentSummary {
  id: string;
  /** Human-readable patient name — lead with this in replies, not the ids. */
  patientName: string | null;
  patientPhone: string | null;
  patientId: string;
  intakeId: string | null;
  chamberId: string | null;
  scheduledAt: number;
  durationMin: number;
  status: AppointmentStatus;
}

export const listAppointmentsTool = defineTool({
  name: "list_appointments",
  description:
    "List appointments filtered by patient, status, and scheduled-at window. " +
    "Returns compact rows ordered by scheduled time, each with the patient's " +
    "NAME and phone — refer to appointments by patient name in your replies, " +
    "never by the raw id. Use get_appointment for one record plus its " +
    "reschedule/cancel history.",
  category: "read",
  inputSchema,
  async execute(
    args,
    ctx: AgentContext,
  ): Promise<{ appointments: AppointmentSummary[] }> {
    assertAdmin(ctx);
    const where: string[] = [];
    const binds: unknown[] = [];

    if (args.patientId) {
      where.push("a.patient_id = ?");
      binds.push(args.patientId);
    }
    if (args.status) {
      where.push("a.status = ?");
      binds.push(args.status);
    }
    if (typeof args.from === "number") {
      where.push("a.scheduled_at >= ?");
      binds.push(args.from);
    }
    if (typeof args.to === "number") {
      where.push("a.scheduled_at <= ?");
      binds.push(args.to);
    }

    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
    // LEFT JOIN patients so each row carries the patient's name + phone. The
    // agent should lead with the name in its replies — raw ids mean nothing to
    // Dr Kyana.
    const sql =
      "SELECT a.*, p.name AS patient_name, p.phone AS patient_phone " +
      "FROM appointments a LEFT JOIN patients p ON p.id = a.patient_id" +
      (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
      " ORDER BY a.scheduled_at ASC LIMIT ?";
    binds.push(limit);

    const { results } = await ctx.env.DB.prepare(sql)
      .bind(...binds)
      .all<Record<string, unknown>>();

    const appointments = (results ?? []).map((r) => {
      const a = mapAppointment(r);
      return {
        id: a.id,
        patientName: (r.patient_name as string | null) ?? null,
        patientPhone: (r.patient_phone as string | null) ?? null,
        patientId: a.patient_id,
        intakeId: a.intake_id ?? null,
        chamberId: a.chamber_id ?? null,
        scheduledAt: a.scheduled_at,
        durationMin: a.duration_min,
        status: a.status,
      };
    });

    return { appointments };
  },
});
