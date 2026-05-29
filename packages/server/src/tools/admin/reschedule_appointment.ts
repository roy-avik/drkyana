/**
 * reschedule_appointment — move an existing appointment to a new slot. WRITE:
 * needsApproval (default). Records a 'rescheduled' appointment_event capturing
 * the prev/next slot and reason (actor = admin email).
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
  id: z.string().min(1).describe("The appointment id."),
  scheduledAt: z.number().int().describe("New slot start time, unix epoch seconds."),
  reason: z.string().optional().describe("Why it was rescheduled."),
});

export const rescheduleAppointmentTool = defineTool({
  name: "reschedule_appointment",
  description:
    "Move an appointment to a new time. Records the previous and new slot in " +
    "the appointment's history. Requires Dr Kyana's approval before it applies.",
  category: "write",
  inputSchema,
  async execute(
    args,
    ctx: AgentContext,
  ): Promise<{ ok: true; appointment: AppointmentRow } | { error: string }> {
    assertAdmin(ctx);
    const current = await fetchAppointment(ctx.env, args.id);
    if (!current) return { error: `appointment not found: ${args.id}` };

    const now = Math.floor(Date.now() / 1000);
    await ctx.env.DB.prepare(
      "UPDATE appointments SET scheduled_at = ?, updated_at = ? WHERE id = ?",
    )
      .bind(args.scheduledAt, now, args.id)
      .run();

    await recordAppointmentEvent(ctx.env, {
      appointmentId: args.id,
      type: "rescheduled",
      detail: {
        prevSlot: current.scheduled_at,
        nextSlot: args.scheduledAt,
        reason: args.reason ?? null,
      },
      actor: ctx.caller.email,
      at: now,
    });

    const appointment = await fetchAppointment(ctx.env, args.id);
    return { ok: true, appointment: appointment! };
  },
});
