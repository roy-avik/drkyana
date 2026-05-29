import "server-only";
import { withAccess } from "@/server/access";
import { listKbDocs } from "@/server/db";
import { ingestDoc, type Env } from "@drkyana/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

/** GET /api/kb — list curated KB docs (registry mirroring Vectorize). */
export const GET = withAccess(async () => {
  const docs = await listKbDocs();
  return Response.json({ docs });
});

interface CreateKbBody {
  title?: string;
  text?: string;
  source?: string | null;
  lang?: string;
  tags?: string[];
}

/**
 * POST /api/kb — ingest a curated reference. Chunks + embeds (Workers AI bge-m3)
 * → Vectorize.upsert → registers in kb_docs. Human-curated: only Dr Kyana (a
 * verified Access admin) can reach this.
 */
export const POST = withAccess(async (req) => {
  const body = (await req.json().catch(() => ({}))) as CreateKbBody;
  const title = body.title?.trim();
  const text = body.text?.trim();
  if (!title || !text) {
    return Response.json({ error: "title and text are required" }, { status: 400 });
  }

  const env = getCloudflareContext().env as unknown as Env;
  try {
    const result = await ingestDoc(env, {
      title,
      text,
      source: body.source ?? null,
      lang: typeof body.lang === "string" ? body.lang : undefined,
      tags: Array.isArray(body.tags) ? body.tags : undefined,
    });
    return Response.json({ doc: result }, { status: 201 });
  } catch (e) {
    // Most likely: Workers AI / Vectorize not yet provisioned. Surface a 502 so
    // the UI can tell Dr Kyana ingestion is unavailable rather than a hard 500.
    return Response.json(
      { error: e instanceof Error ? e.message : "ingest failed" },
      { status: 502 },
    );
  }
});
