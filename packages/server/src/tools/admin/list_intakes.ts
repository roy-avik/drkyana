/**
 * list_intakes — admin read of the intake queue, filtered by status / triage /
 * date window. Urgent-first ordering (RED→ORANGE→YELLOW→GREEN, then newest).
 *
 * Returns COMPACT summary rows (no full medical history) — the agent can call
 * get_intake for a single record when it needs detail. Keeps PHI + tokens lean.
 *
 * category 'read'.
 */
import { z } from "zod";
import type { IntakeStatus, TriageLevel } from "@drkyana/types";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";

const statusEnum = z.enum([
  "new",
  "contacted",
  "scheduled",
  "completed",
  "closed",
]);
const triageEnum = z.enum(["RED", "ORANGE", "YELLOW", "GREEN"]);

const inputSchema = z.object({
  status: statusEnum.optional().describe("Filter by workflow status."),
  triage: z
    .array(triageEnum)
    .optional()
    .describe("Filter by one or more triage levels, e.g. ['RED','ORANGE']."),
  since: z
    .number()
    .int()
    .optional()
    .describe("Unix epoch seconds — only intakes created at/after this."),
  until: z
    .number()
    .int()
    .optional()
    .describe("Unix epoch seconds — only intakes created at/before this."),
  limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 25)."),
});

export interface IntakeSummary {
  id: string;
  patientId: string | null;
  name: string | null;
  phone: string | null;
  affectedArea: string | null;
  severity: number | null;
  triageLevel: TriageLevel | null;
  status: IntakeStatus;
  createdAt: number;
}

export const listIntakesTool = defineTool({
  name: "list_intakes",
  description:
    "List patient intakes filtered by status, triage level, and date range. " +
    "Returns compact summaries ordered urgent-first then newest. Use get_intake " +
    "for the full detail of one record.",
  category: "read",
  inputSchema,
  async execute(args, ctx: AgentContext): Promise<{ intakes: IntakeSummary[] }> {
    assertAdmin(ctx);
    const where: string[] = [];
    const binds: unknown[] = [];

    if (args.status) {
      where.push("status = ?");
      binds.push(args.status);
    }
    if (args.triage && args.triage.length) {
      where.push(`triage_level IN (${args.triage.map(() => "?").join(",")})`);
      binds.push(...args.triage);
    }
    if (typeof args.since === "number") {
      where.push("created_at >= ?");
      binds.push(args.since);
    }
    if (typeof args.until === "number") {
      where.push("created_at <= ?");
      binds.push(args.until);
    }

    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
    const sql =
      "SELECT id, patient_id, name, phone, affected_area, severity, triage_level, status, created_at FROM intakes" +
      (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
      " ORDER BY CASE triage_level WHEN 'RED' THEN 0 WHEN 'ORANGE' THEN 1 WHEN 'YELLOW' THEN 2 WHEN 'GREEN' THEN 3 ELSE 4 END, created_at DESC" +
      " LIMIT ?";
    binds.push(limit);

    const { results } = await ctx.env.DB.prepare(sql)
      .bind(...binds)
      .all<Record<string, unknown>>();

    const intakes = (results ?? []).map((r) => ({
      id: String(r.id),
      patientId: (r.patient_id as string | null) ?? null,
      name: (r.name as string | null) ?? null,
      phone: (r.phone as string | null) ?? null,
      affectedArea: (r.affected_area as string | null) ?? null,
      severity: (r.severity as number | null) ?? null,
      triageLevel: (r.triage_level as TriageLevel | null) ?? null,
      status: (r.status as IntakeStatus) ?? "new",
      createdAt: Number(r.created_at ?? 0),
    }));

    return { intakes };
  },
});
