/**
 * Cross-session activity log (admin_actions) — the memory that ties surfaces
 * together. A write executed from ANY surface (in-app agent loop, an MCP host
 * like the Claude/ChatGPT apps, or a click inside a rendered admin view) is
 * recorded here, so any OTHER session can ask "what happened recently?"
 * (get_recent_activity tool / open_activity view).
 *
 * PHI hygiene: `detail` keeps only short primitive args (ids, statuses,
 * enum-ish strings). Document bodies, notes, and anything long never enter
 * the log — the log answers WHO did WHAT to WHICH record, not what it said.
 */
import type { AdminActionRow, AdminActionSurface, AdminActionKind } from "@drkyana/types";
import type { Env } from "./bindings";

export type ActionSurface = AdminActionSurface;
export type { AdminActionRow, AdminActionKind };

const MAX_DETAIL_VALUE = 80;

/** Keep only short primitives — ids, statuses, small numbers, flags. */
export function filterActionDetail(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    if (typeof v === "string" && v.length <= MAX_DETAIL_VALUE) out[k] = v;
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    // objects/arrays/long strings (markdown, notes, schedules) stay out
  }
  return out;
}

export async function recordAdminAction(
  env: Env,
  entry: {
    actor: string;
    surface: ActionSurface;
    tool: string;
    args?: unknown;
    /** 'write' (default) = a state change; 'read' = a logged PHI access. */
    kind?: AdminActionKind;
  },
): Promise<void> {
  try {
    await env.DB.prepare(
      "INSERT INTO admin_actions (id, actor, surface, kind, tool, detail, at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())",
    )
      .bind(
        `act_${crypto.randomUUID()}`,
        entry.actor,
        entry.surface,
        entry.kind ?? "write",
        entry.tool,
        JSON.stringify(filterActionDetail(entry.args)),
      )
      .run();
  } catch (err) {
    // Logging must never break the action it describes (the business write
    // has ALREADY committed by the time this runs). But never silently:
    // a dropped entry — usually the 0007 migration not yet applied — must
    // show up in Workers logs / wrangler tail so the gap is noticed.
    console.error(
      `admin_actions insert failed (entry dropped: ${entry.tool} by ${entry.actor}):`,
      (err as Error).message,
    );
  }
}

export async function listAdminActions(
  env: Env,
  limit = 20,
  /** Filter by kind. Defaults to 'write' so the activity feed stays about state
   *  changes; pass 'read' for the PHI-access audit, or null for everything. */
  kind: AdminActionKind | null = "write",
): Promise<AdminActionRow[]> {
  try {
    const where = kind ? "WHERE kind = ?" : "";
    const binds: unknown[] = kind ? [kind, Math.min(Math.max(limit, 1), 100)] : [Math.min(Math.max(limit, 1), 100)];
    const { results } = await env.DB.prepare(
      `SELECT * FROM admin_actions ${where} ORDER BY at DESC LIMIT ?`,
    )
      .bind(...binds)
      .all<Record<string, unknown>>();
    return (results ?? []).map((r) => ({
      id: String(r.id),
      actor: String(r.actor),
      surface: (r.surface as ActionSurface) ?? "agent",
      kind: (r.kind as AdminActionKind) ?? "write",
      tool: String(r.tool),
      detail: safeParse(r.detail),
      at: Number(r.at ?? 0),
    }));
  } catch (err) {
    // Table may not exist yet — read as "no activity", but say so in logs.
    console.error("admin_actions read failed:", (err as Error).message);
    return [];
  }
}

function safeParse(v: unknown): Record<string, unknown> {
  if (typeof v !== "string") return {};
  try {
    const parsed = JSON.parse(v);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
