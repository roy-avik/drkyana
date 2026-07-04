/**
 * View tools + app-only action tools for the admin views.
 *
 * View tools (open_*) are READ tools that return `{ summary, view }`:
 *  - `view` is a View-DSL document (docs/view-dsl.md) rendered interactively —
 *    by the MCP App template inside agent hosts, and by ViewRenderer.tsx
 *    inside the admin assistant chat.
 *  - `summary` is the compact text the MODEL reasons over (`modelSummary`
 *    keeps the document payload out of the model context in the agent loop;
 *    the MCP server sends it as the text content block).
 *
 * App-only tools (ui_*) exist for buttons inside rendered views that have no
 * model-facing equivalent (draft review edits). They are NEVER registered in
 * an agent's toolset and are listed over MCP with visibility ["app"] — only
 * the rendered view can call them, and the click is Dr Kyana's approval, so
 * `needsApproval` is explicitly false.
 */
import { z } from "zod";
import type { DraftStatus, ViewDocument } from "@drkyana/types";
import { defineTool, type ToolRegistry } from "../tools";
import type { AgentContext } from "../context";
import { assertAdmin } from "../context";
// Individual tool modules (not ../tools/admin/index) — the admin registry
// spreads viewTools in, so importing the barrel here would be a cycle.
import { updateStatusTool } from "../tools/admin/update_status";
import { upsertChamberTool } from "../tools/admin/upsert_chamber";
import {
  buildAppointments,
  buildChambers,
  buildDraftReview,
  buildDrafts,
  buildIntakeDetail,
  buildIntakeQueue,
} from "./views";

export interface ViewToolOutput {
  summary: string;
  view: ViewDocument;
}

const summarize = (result: unknown): string => {
  const r = result as Partial<ViewToolOutput> & { error?: string };
  return r.error ?? r.summary ?? "view rendered";
};

function notFound(what: string, id: string): { error: string } {
  return { error: `${what} not found: ${id}` };
}

// ---------------------------------------------------------------------------
// View tools (model-visible, read-only)
// ---------------------------------------------------------------------------

export const openIntakeQueueTool = defineTool({
  name: "open_intake_queue",
  description:
    "Open the interactive intake-queue view (filters, urgent-first list, tap-through " +
    "to detail). Use when Dr Kyana wants to SEE or WORK the queue rather than read a " +
    "text summary.",
  category: "read",
  inputSchema: z.object({
    status: z.enum(["new", "contacted", "scheduled", "completed", "closed"]).optional(),
    triage: z.array(z.enum(["RED", "ORANGE", "YELLOW", "GREEN"])).optional(),
    days: z.number().int().min(0).max(365).optional()
      .describe("Only intakes from the last N days (0 = all time)."),
  }),
  modelSummary: summarize,
  async execute(args, ctx: AgentContext) {
    assertAdmin(ctx);
    const view = await buildIntakeQueue(ctx, args);
    return { summary: `Opened intake queue (${view.subtitle ?? ""})`, view };
  },
});

export const openIntakeTool = defineTool({
  name: "open_intake",
  description:
    "Open one intake as an interactive detail view (full record, medical history, " +
    "appointments, status form).",
  category: "read",
  inputSchema: z.object({ intakeId: z.string().min(1) }),
  modelSummary: summarize,
  async execute(args, ctx: AgentContext) {
    assertAdmin(ctx);
    const view = await buildIntakeDetail(ctx, args.intakeId);
    if (!view) return notFound("intake", args.intakeId);
    return { summary: `Opened intake ${args.intakeId} (${view.title})`, view };
  },
});

export const openChambersTool = defineTool({
  name: "open_chambers",
  description:
    "Open the interactive chambers view (list + create form; pass chamberId to edit " +
    "that chamber).",
  category: "read",
  inputSchema: z.object({
    chamberId: z.string().optional().describe("Chamber to open in the edit form."),
  }),
  modelSummary: summarize,
  async execute(args, ctx: AgentContext) {
    assertAdmin(ctx);
    const view = await buildChambers(ctx, args.chamberId);
    return { summary: "Opened chambers view", view };
  },
});

export const openDraftsTool = defineTool({
  name: "open_drafts",
  description: "Open the interactive drafts list (filter by status, tap-through to review).",
  category: "read",
  inputSchema: z.object({
    status: z.enum(["draft", "approved", "sent"]).optional(),
  }),
  modelSummary: summarize,
  async execute(args, ctx: AgentContext) {
    assertAdmin(ctx);
    const view = await buildDrafts(ctx, args.status);
    return { summary: "Opened drafts list", view };
  },
});

export const openDraftTool = defineTool({
  name: "open_draft",
  description:
    "Open one draft in the interactive review view (rendered markdown, citations, " +
    "edit + approve/send actions).",
  category: "read",
  inputSchema: z.object({ draftId: z.string().min(1) }),
  modelSummary: summarize,
  async execute(args, ctx: AgentContext) {
    assertAdmin(ctx);
    const view = await buildDraftReview(ctx, args.draftId);
    if (!view) return notFound("draft", args.draftId);
    return { summary: `Opened draft ${args.draftId} for review`, view };
  },
});

export const openAppointmentsTool = defineTool({
  name: "open_appointments",
  description:
    "Open the interactive appointments view (granted visits across chambers, filter " +
    "by status).",
  category: "read",
  inputSchema: z.object({
    status: z
      .enum(["proposed", "confirmed", "completed", "cancelled", "no_show"])
      .optional(),
  }),
  modelSummary: summarize,
  async execute(args, ctx: AgentContext) {
    assertAdmin(ctx);
    const view = await buildAppointments(ctx, args.status);
    return { summary: "Opened appointments view", view };
  },
});

/** Registered into the admin agent's toolset AND listed over MCP. */
export const viewTools: ToolRegistry = {
  open_intake_queue: openIntakeQueueTool,
  open_intake: openIntakeTool,
  open_chambers: openChambersTool,
  open_drafts: openDraftsTool,
  open_draft: openDraftTool,
  open_appointments: openAppointmentsTool,
};

// ---------------------------------------------------------------------------
// App-only action tools (visibility ["app"] — never offered to the model)
// ---------------------------------------------------------------------------

export const uiUpdateDraftTool = defineTool({
  name: "ui_update_draft",
  description:
    "Save edited markdown on a draft. App-only: invoked by Dr Kyana's click in the " +
    "draft-review view.",
  category: "write",
  // The invoking click in the admin view IS Dr Kyana's approval.
  needsApproval: false,
  inputSchema: z.object({
    draftId: z.string().min(1),
    markdown: z.string().min(1),
  }),
  async execute(args, ctx: AgentContext) {
    assertAdmin(ctx);
    const exists = await ctx.env.DB.prepare("SELECT id FROM drafts WHERE id = ?")
      .bind(args.draftId)
      .first<{ id: string }>();
    if (!exists) return notFound("draft", args.draftId);
    await ctx.env.DB.prepare(
      "UPDATE drafts SET markdown = ?, updated_at = unixepoch() WHERE id = ?",
    )
      .bind(args.markdown, args.draftId)
      .run();
    return { ok: true, draftId: args.draftId };
  },
});

export const uiSetDraftStatusTool = defineTool({
  name: "ui_set_draft_status",
  description:
    "Set a draft's review status (draft/approved/sent). App-only: invoked by Dr " +
    "Kyana's click in the draft-review view. Recording 'sent' does not deliver " +
    "anything — delivery goes through the send pipeline.",
  category: "write",
  needsApproval: false,
  inputSchema: z.object({
    draftId: z.string().min(1),
    status: z.enum(["draft", "approved", "sent"]),
  }),
  async execute(args, ctx: AgentContext) {
    assertAdmin(ctx);
    const exists = await ctx.env.DB.prepare("SELECT id FROM drafts WHERE id = ?")
      .bind(args.draftId)
      .first<{ id: string }>();
    if (!exists) return notFound("draft", args.draftId);
    await ctx.env.DB.prepare(
      "UPDATE drafts SET status = ?, updated_at = unixepoch() WHERE id = ?",
    )
      .bind(args.status, args.draftId)
      .run();
    return { ok: true, draftId: args.draftId, status: args.status };
  },
});

export const appActionTools: ToolRegistry = {
  ui_update_draft: uiUpdateDraftTool,
  ui_set_draft_status: uiSetDraftStatusTool,
};

/**
 * The EXACT set of tools a rendered view may invoke through the in-app action
 * endpoint (/api/views/action): the view tools themselves (navigation +
 * refresh), the app-only draft actions, and the two writes the view forms
 * reference. Anything else in the admin toolset stays chat/MCP-only — a view
 * document can't be crafted to reach it from the browser.
 */
export const viewActionTools: ToolRegistry = {
  ...viewTools,
  ...appActionTools,
  update_status: updateStatusTool,
  upsert_chamber: upsertChamberTool,
};
