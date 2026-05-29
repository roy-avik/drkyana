/**
 * upsert_chamber — create or update a chamber (Dr Kyana's mobile locations
 * across Dhaka). WRITE: needsApproval (default).
 *
 * If `id` is supplied it updates that chamber (only provided fields change);
 * otherwise it inserts a new one.
 *
 * category 'write'.
 */
import { z } from "zod";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";

const scheduleSlot = z.object({
  day: z.string().describe("'mon'..'sun'"),
  from: z.string().describe("'09:00'"),
  to: z.string().describe("'13:00'"),
});

const inputSchema = z.object({
  id: z.string().optional().describe("Existing chamber id to update; omit to create."),
  name: z.string().optional(),
  area: z.string().optional(),
  address: z.string().optional(),
  services: z.array(z.string()).optional().describe("Capability tags, e.g. ['scaling','rct','general']."),
  schedule: z.array(scheduleSlot).optional(),
  active: z.boolean().optional(),
});

export const upsertChamberTool = defineTool({
  name: "upsert_chamber",
  description:
    "Create or update a chamber (one of Dr Kyana's locations across Dhaka). Pass " +
    "an id to update; omit it to create. Requires Dr Kyana's approval.",
  category: "write",
  inputSchema,
  async execute(
    args,
    ctx: AgentContext,
  ): Promise<{ ok: true; id: string; created: boolean } | { error: string }> {
    assertAdmin(ctx);
    const now = Math.floor(Date.now() / 1000);

    if (args.id) {
      const existing = await ctx.env.DB.prepare("SELECT id FROM chambers WHERE id = ?")
        .bind(args.id)
        .first<{ id: string }>();
      if (!existing) return { error: `chamber not found: ${args.id}` };

      const sets: string[] = [];
      const binds: unknown[] = [];
      if (args.name !== undefined) (sets.push("name = ?"), binds.push(args.name));
      if (args.area !== undefined) (sets.push("area = ?"), binds.push(args.area));
      if (args.address !== undefined) (sets.push("address = ?"), binds.push(args.address));
      if (args.services !== undefined)
        (sets.push("services = ?"), binds.push(JSON.stringify(args.services)));
      if (args.schedule !== undefined)
        (sets.push("schedule = ?"), binds.push(JSON.stringify(args.schedule)));
      if (args.active !== undefined) (sets.push("active = ?"), binds.push(args.active ? 1 : 0));
      if (sets.length) {
        sets.push("updated_at = ?");
        binds.push(now, args.id);
        await ctx.env.DB.prepare(`UPDATE chambers SET ${sets.join(", ")} WHERE id = ?`)
          .bind(...binds)
          .run();
      }
      return { ok: true, id: args.id, created: false };
    }

    if (!args.name || !args.area) {
      return { error: "name and area are required to create a chamber" };
    }
    const id = `ch_${crypto.randomUUID()}`;
    await ctx.env.DB.prepare(
      "INSERT INTO chambers (id, name, area, address, services, schedule, active, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        id,
        args.name,
        args.area,
        args.address ?? null,
        JSON.stringify(args.services ?? []),
        JSON.stringify(args.schedule ?? []),
        args.active === false ? 0 : 1,
        now,
        now,
      )
      .run();
    return { ok: true, id, created: true };
  },
});
