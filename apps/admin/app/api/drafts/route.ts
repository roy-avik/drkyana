import { withAccess } from "@/server/access";
import { listDrafts } from "@/server/db";
import type { DraftStatus } from "@drkyana/types";

export const dynamic = "force-dynamic";

/** GET /api/drafts?status=draft|approved|sent */
export const GET = withAccess(async (req) => {
  const status = new URL(req.url).searchParams.get("status") as DraftStatus | null;
  const drafts = await listDrafts(status ?? undefined);
  return Response.json({ drafts });
});
