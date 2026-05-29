import { withAccess } from "@/server/access";
import { getIntake, getPatient, updateIntakeStatus } from "@/server/db";
import type { IntakeStatus } from "@drkyana/types";

export const dynamic = "force-dynamic";

function idFromUrl(req: Request): string {
  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(segments[segments.length - 1] ?? "");
}

/** GET /api/intakes/:id — intake + linked patient summary/memory. */
export const GET = withAccess(async (req) => {
  const id = idFromUrl(req);
  const intake = await getIntake(id);
  if (!intake) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const patient = intake.patient_id ? await getPatient(intake.patient_id) : null;
  return Response.json({ intake, patient });
});

/** PATCH /api/intakes/:id  body: { status } — status workflow. */
export const PATCH = withAccess(async (req) => {
  const id = idFromUrl(req);
  const body = (await req.json().catch(() => ({}))) as { status?: IntakeStatus };
  if (!body.status) {
    return Response.json({ error: "missing_status" }, { status: 400 });
  }
  try {
    const updated = await updateIntakeStatus(id, body.status);
    if (!updated) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ intake: updated });
  } catch (err) {
    return Response.json(
      { error: "bad_request", detail: (err as Error).message },
      { status: 400 },
    );
  }
});
