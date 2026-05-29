import { withAccess } from "@/server/access";
import {
  listAppointments,
  createAppointment,
  type AppointmentFilter,
  type AppointmentInput,
} from "@/server/db";
import type { AppointmentStatus } from "@drkyana/types";

export const dynamic = "force-dynamic";

/** GET /api/appointments?patientId=&intakeId=&status= */
export const GET = withAccess(async (req) => {
  const q = new URL(req.url).searchParams;
  const filter: AppointmentFilter = {};
  const patientId = q.get("patientId");
  if (patientId) filter.patientId = patientId;
  const intakeId = q.get("intakeId");
  if (intakeId) filter.intakeId = intakeId;
  const status = q.get("status");
  if (status) filter.status = status as AppointmentStatus;
  const appointments = await listAppointments(filter);
  return Response.json({ appointments });
});

/** POST /api/appointments — create a (proposed) appointment. */
export const POST = withAccess(async (req, identity) => {
  const body = (await req.json().catch(() => ({}))) as Partial<AppointmentInput>;
  if (!body.patientId || typeof body.scheduledAt !== "number") {
    return Response.json(
      { error: "bad_request", detail: "patientId and scheduledAt required" },
      { status: 400 },
    );
  }
  const appointment = await createAppointment(
    {
      patientId: body.patientId,
      intakeId: body.intakeId ?? null,
      chamberId: body.chamberId ?? null,
      scheduledAt: body.scheduledAt,
      durationMin: body.durationMin,
      note: body.note ?? null,
    },
    identity.email,
  );
  return Response.json({ appointment });
});
