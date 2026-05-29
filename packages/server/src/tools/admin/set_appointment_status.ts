/**
 * set_appointment_status — confirm / complete / cancel / mark-no-show an
 * appointment. WRITE: needsApproval (default) — Dr Kyana confirms before it
 * applies. Records a history event (actor = admin email) capturing the
 * status transition. category 'write'.
 */
import { z } from "zod";
import type { AppointmentRow, AppointmentEventType } from "@drkyana/types";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";
import { fetchAppointment, recordAppointmentEvent } from "./appointments_shared";

// The statuses reachable via this tool (proposed is the initial state from
// create; reschedule keeps the status). Each maps 1:1 to a history event type.
const SETTABLE = ["confirmed", "completed", "cancelled", "no_show"] as const;

const inputSchema = z.object({
  appointmentId: z.string().min(1),
  status: z.enum(SETTABLE),
  reason: z.string().optional().describe("Why (e.g. cancellation reason)."),
});

export const setAppointmentStatusTool = defineTool({
  name: "set_appointment_status",
  description:
    "Set an appointment's status (confirm, complete, cancel, or mark no-show). " +
    "Requires Dr Kyana's approval; records an audit-trail event.",
  category: "write",
  inputSchema,
  async execute(
    args,
    ctx: AgentContext,
  ): Promise<{ ok: true; appointment: AppointmentRow } | { error: string }> {
    assertAdmin(ctx);
    const current = await fetchAppointment(ctx.env, args.appointmentId);
    if (!current) return { error: `appointment not found: ${args.appointmentId}` };

    const now = Math.floor(Date.now() / 1000);
    await ctx.env.DB.prepare(
      "UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?",
    )
      .bind(args.status, now, args.appointmentId)
      .run();

    await recordAppointmentEvent(ctx.env, {
      appointmentId: args.appointmentId,
      type: args.status as AppointmentEventType,
      detail: {
        prevStatus: current.status,
        nextStatus: args.status,
        reason: args.reason,
      },
      actor: ctx.caller.email,
      at: now,
    });

    const appointment = await fetchAppointment(ctx.env, args.appointmentId);
    return { ok: true, appointment: appointment! };
  },
});
