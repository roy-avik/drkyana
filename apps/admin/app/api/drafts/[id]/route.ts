import { withAccess } from "@/server/access";
import { getDraft, updateDraftMarkdown } from "@/server/db";

export const dynamic = "force-dynamic";

function idFromUrl(req: Request): string {
  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(segments[segments.length - 1] ?? "");
}

/** GET /api/drafts/:id — fetch one for review. */
export const GET = withAccess(async (req) => {
  const draft = await getDraft(idFromUrl(req));
  if (!draft) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ draft });
});

/** PATCH /api/drafts/:id  body: { markdown } — save edited markdown. */
export const PATCH = withAccess(async (req) => {
  const id = idFromUrl(req);
  const body = (await req.json().catch(() => ({}))) as { markdown?: string };
  if (typeof body.markdown !== "string") {
    return Response.json({ error: "missing_markdown" }, { status: 400 });
  }
  const draft = await updateDraftMarkdown(id, body.markdown);
  if (!draft) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ draft });
});
