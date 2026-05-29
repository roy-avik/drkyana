import { withAccess } from "@/server/access";
import {
  getAppointment,
  getAppointmentEvents,
  rescheduleAppointment,
  setAppointmentStatus,
} from "@/server/db";
import type { AppointmentStatus } from "@drkyana/types";

export const dynamic = "force-dynamic";

function idFromUrl(req: Request): string {
  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(segments[segments.length - 1] ?? "");
}

/** GET /api/appointments/:id — appointment + its event history. */
export const GET = withAccess(async (req) => {
  const id = idFromUrl(req);
  const appointment = await getAppointment(id);
  if (!appointment) return Response.json({ error: "not_found" }, { status: 404 });
  const events = await getAppointmentEvents(id);
  return Response.json({ appointment, events });
});

/**
 * PATCH /api/appointments/:id
 *   body: { scheduledAt, reason? }  → reschedule
 *   body: { status, reason? }       → set status (confirm/complete/cancel/no_show)
 */
export const PATCH = withAccess(async (req, identity) => {
  const id = idFromUrl(req);
  const body = (await req.json().catch(() => ({}))) as {
    scheduledAt?: number;
    status?: AppointmentStatus;
    reason?: string;
  };
  try {
    let appointment;
    if (typeof body.scheduledAt === "number") {
      appointment = await rescheduleAppointment(
        id,
        body.scheduledAt,
        identity.email,
        body.reason,
      );
    } else if (body.status) {
      appointment = await setAppointmentStatus(
        id,
        body.status,
        identity.email,
        body.reason,
      );
    } else {
      return Response.json(
        { error: "bad_request", detail: "scheduledAt or status required" },
        { status: 400 },
      );
    }
    if (!appointment) return Response.json({ error: "not_found" }, { status: 404 });
    const events = await getAppointmentEvents(id);
    return Response.json({ appointment, events });
  } catch (err) {
    return Response.json(
      { error: "bad_request", detail: (err as Error).message },
      { status: 400 },
    );
  }
});
