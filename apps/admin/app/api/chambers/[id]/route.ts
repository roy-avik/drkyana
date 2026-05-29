import { withAccess } from "@/server/access";
import {
  getChamber,
  updateChamber,
  deactivateChamber,
  type ChamberInput,
} from "@/server/db";

export const dynamic = "force-dynamic";

function idFromUrl(req: Request): string {
  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(segments[segments.length - 1] ?? "");
}

/** GET /api/chambers/:id */
export const GET = withAccess(async (req) => {
  const chamber = await getChamber(idFromUrl(req));
  if (!chamber) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ chamber });
});

/** PATCH /api/chambers/:id — update fields. */
export const PATCH = withAccess(async (req) => {
  const id = idFromUrl(req);
  const body = (await req.json().catch(() => ({}))) as Partial<ChamberInput>;
  const chamber = await updateChamber(id, body);
  if (!chamber) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ chamber });
});

/** DELETE /api/chambers/:id — soft-delete (deactivate). */
export const DELETE = withAccess(async (req) => {
  const id = idFromUrl(req);
  const chamber = await deactivateChamber(id);
  if (!chamber) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ chamber });
});
