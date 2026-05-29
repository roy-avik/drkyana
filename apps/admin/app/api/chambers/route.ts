import { withAccess } from "@/server/access";
import { listChambers, createChamber, type ChamberInput } from "@/server/db";

export const dynamic = "force-dynamic";

/** GET /api/chambers — list all (active + inactive). */
export const GET = withAccess(async () => {
  const chambers = await listChambers(true);
  return Response.json({ chambers });
});

/** POST /api/chambers — create a chamber. */
export const POST = withAccess(async (req) => {
  const body = (await req.json().catch(() => ({}))) as Partial<ChamberInput>;
  if (!body.name || !body.area) {
    return Response.json({ error: "name and area are required" }, { status: 400 });
  }
  const chamber = await createChamber({
    name: body.name,
    area: body.area,
    address: body.address ?? null,
    services: body.services ?? [],
    schedule: body.schedule ?? [],
    active: body.active ?? true,
  });
  return Response.json({ chamber }, { status: 201 });
});
