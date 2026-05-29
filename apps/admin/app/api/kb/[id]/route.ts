import "server-only";
import { withAccess } from "@/server/access";
import { deleteDoc, type Env } from "@drkyana/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

function idFromUrl(req: Request): string {
  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(segments[segments.length - 1] ?? "");
}

/** DELETE /api/kb/:id — remove a doc's vectors from Vectorize + its kb_docs row. */
export const DELETE = withAccess(async (req) => {
  const id = idFromUrl(req);
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });
  const env = getCloudflareContext().env as unknown as Env;
  try {
    const removed = await deleteDoc(env, id);
    if (!removed) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "delete failed" },
      { status: 502 },
    );
  }
});
