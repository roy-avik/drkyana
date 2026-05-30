import { withAccess } from "@/server/access";
import { setClinicalAssistSupersede } from "@/server/db";

export const dynamic = "force-dynamic";

function idFromUrl(req: Request): string {
  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(segments[segments.length - 1] ?? "");
}

/**
 * PATCH /api/clinical-assists/:id
 * Body: { note: string }
 *
 * Supersede an AI-generated assist with Dr Kyana's clinical note. The note is
 * the authoritative record; the AI draft stays on the row for audit. The
 * verified Access JWT email is recorded as `superseded_by` — model args are
 * never trusted for that.
 */
export const PATCH = withAccess(async (req, identity) => {
  const id = idFromUrl(req);
  const body = (await req.json().catch(() => ({}))) as { note?: string };
  const note = (body.note ?? "").trim();
  if (!note) {
    return Response.json({ error: "missing_note" }, { status: 400 });
  }
  const updated = await setClinicalAssistSupersede(id, note, identity.email);
  if (!updated) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ assist: updated });
});
