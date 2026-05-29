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

export const getAppointmentTool = defineTool({
  name: "get_appointment",
  description:
    "Fetch one appointment by id plus its full event history (created, " +
    "rescheduled, confirmed, cancelled, completed, no_show).",
  category: "read",
  inputSchema,
  async execute(
    args,
    ctx: AgentContext,
  ): Promise<
    | { appointment: AppointmentRow; events: AppointmentEventRow[] }
    | { appointment: null }
  > {
    assertAdmin(ctx);
    const appointment = await fetchAppointment(ctx.env, args.id);
    if (!appointment) return { appointment: null };
    const events = await fetchAppointmentEvents(ctx.env, args.id);
    return { appointment, events };
  },
});
