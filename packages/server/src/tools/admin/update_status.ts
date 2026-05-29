/**
 * update_status — move an intake through the workflow (new → contacted →
 * scheduled → completed → closed). WRITE: needsApproval (default) — the SDK
 * pauses for Dr Kyana's confirmation before the row changes.
 *
 * category 'write'.
 */
import { z } from "zod";
import type { IntakeStatus } from "@drkyana/types";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";

const inputSchema = z.object({
  intakeId: z.string().min(1),
  status: z.enum(["new", "contacted", "scheduled", "completed", "closed"]),
  note: z
    .string()
    .optional()
    .describe("Optional note recorded with the status change (appended to raw_message)."),
});

export const updateStatusTool = defineTool({
  name: "update_status",
  description:
    "Update an intake's workflow status (new/contacted/scheduled/completed/closed). " +
    "Requires Dr Kyana's approval before it applies.",
  category: "write",
  inputSchema,
  async execute(
    args,
    ctx: AgentContext,
  ): Promise<{ ok: true; intakeId: string; status: IntakeStatus } | { error: string }> {
    assertAdmin(ctx);
    const exists = await ctx.env.DB.prepare("SELECT id FROM intakes WHERE id = ?")
      .bind(args.intakeId)
      .first<{ id: string }>();
    if (!exists) return { error: `intake not found: ${args.intakeId}` };

    const now = Math.floor(Date.now() / 1000);
    if (args.note) {
      await ctx.env.DB.prepare(
        "UPDATE intakes SET status = ?, raw_message = COALESCE(raw_message || char(10), '') || ?, updated_at = ? WHERE id = ?",
      )
        .bind(args.status, `[${args.status}] ${args.note}`, now, args.intakeId)
        .run();
    } else {
      await ctx.env.DB.prepare(
        "UPDATE intakes SET status = ?, updated_at = ? WHERE id = ?",
      )
        .bind(args.status, now, args.intakeId)
        .run();
    }
    return { ok: true, intakeId: args.intakeId, status: args.status };
  },
});
