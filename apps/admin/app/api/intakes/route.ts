import { withAccess } from "@/server/access";
import { listIntakes, type IntakeFilter } from "@/server/db";
import type { IntakeStatus, TriageLevel } from "@drkyana/types";

export const dynamic = "force-dynamic";

/** GET /api/intakes?status=&triage=RED,ORANGE&since=&until=&limit= */
export const GET = withAccess(async (req) => {
  const url = new URL(req.url);
  const q = url.searchParams;
  const filter: IntakeFilter = {};

  const status = q.get("status");
  if (status) filter.status = status as IntakeStatus;

  const triage = q.get("triage");
  if (triage) filter.triage = triage.split(",").map((t) => t.trim()) as TriageLevel[];

  const since = q.get("since");
  if (since) filter.since = Number(since);
  const until = q.get("until");
  if (until) filter.until = Number(until);
  const limit = q.get("limit");
  if (limit) filter.limit = Number(limit);

  const rows = await listIntakes(filter);
  return Response.json({ intakes: rows });
});
