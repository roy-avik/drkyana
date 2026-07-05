/**
 * get_recent_activity — the cross-session memory read. Returns the latest
 * entries from the admin_actions log: every WRITE performed on the practice
 * from ANY surface (in-app assistant, connected Claude/ChatGPT apps, clicks
 * inside rendered admin views), with actor, surface, and id-level detail.
 *
 * Use it to catch up on what happened outside this conversation before
 * acting — e.g. when Dr Kyana references "the intake I updated on my phone".
 *
 * category 'read'.
 */
import { z } from "zod";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";
import { listAdminActions } from "../../audit";

const inputSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().describe("Max entries (default 20)."),
});

export const getRecentActivityTool = defineTool({
  name: "get_recent_activity",
  description:
    "List recent practice actions from ALL surfaces and sessions (assistant chats, " +
    "connected Claude/ChatGPT apps, console view clicks): who ran which write, on " +
    "which record, when. Check this when the conversation references something that " +
    "may have happened elsewhere.",
  category: "read",
  inputSchema,
  async execute(args, ctx: AgentContext) {
    assertAdmin(ctx);
    const actions = await listAdminActions(ctx.env, args.limit ?? 20);
    return {
      actions: actions.map((a) => ({
        at: a.at,
        actor: a.actor,
        surface: a.surface,
        tool: a.tool,
        detail: a.detail,
      })),
    };
  },
});
