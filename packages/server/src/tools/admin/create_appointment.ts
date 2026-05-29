/**
 * create_appointment — book a new (proposed) appointment for a patient. WRITE:
 * needsApproval (default) — the SDK pauses for Dr Kyana's confirmation before
 * the row is created. Records a 'created' appointment_event (actor = admin email).
 *
 * category 'write'.
 */
import { z } from "zod";
import type { AppointmentRow } from "@drkyana/types";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";
import { fetchAppointment, recordAppointmentEvent } from "./appointments_shared";

const inputSchema = z.object({
  patientId: z.string().min(1).describe("The patient to book."),
  intakeId: z.string().optional().describe("Originating intake, if any."),
  chamberId: z.string().optional().describe("Chamber where the visit will occur."),
  scheduledAt: z
    .number()
    .int()
    .describe("Slot start time, unix epoch seconds."),
  durationMin: z.number().int().min(5).max(480).optional().describe("Default 30."),
  note: z.string().optional(),
});

export const createAppointmentTool = defineTool({
  name: "create_appointment",
  description:
    "Create a proposed appointment for a patient at a given time (and optional " +
    "chamber / linked intake). Requires Dr Kyana's approval before it applies.",
  category: "write",
  inputSchema,
  async execute(
    args,
    ctx: AgentContext,
  ): Promise<{ ok: true; appointment: AppointmentRow } | { error: string }> {
    assertAdmin(ctx);
    const patient = await ctx.env.DB.prepare("SELECT id FROM patients WHERE id = ?")
      .bind(args.patientId)
      .first<{ id: string }>();
    if (!patient) return { error: `patient not found: ${args.patientId}` };

    const id = `appt_${crypto.randomUUID()}`;
    const now = Math.floor(Date.now() / 1000);
    const duration = args.durationMin ?? 30;

    await ctx.env.DB.prepare(
      "INSERT INTO appointments (id, patient_id, intake_id, chamber_id, scheduled_at, " +
        "duration_min, status, note, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?, ?, ?)",
    )
      .bind(
        id,
        args.patientId,
        args.intakeId ?? null,
        args.chamberId ?? null,
        args.scheduledAt,
        duration,
        args.note ?? null,
        now,
        now,
      )
      .run();

    await recordAppointmentEvent(ctx.env, {
      appointmentId: id,
      type: "created",
      detail: { nextSlot: args.scheduledAt, nextStatus: "proposed" },
      actor: ctx.caller.email,
      at: now,
    });

    const appointment = await fetchAppointment(ctx.env, id);
    return { ok: true, appointment: appointment! };
  },
});
