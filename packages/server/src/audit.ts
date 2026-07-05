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
import type { AdminActionRow, AdminActionSurface } from "@drkyana/types";
import type { Env } from "./bindings";

export type ActionSurface = AdminActionSurface;
export type { AdminActionRow };

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
  },
): Promise<void> {
  try {
    await env.DB.prepare(
      "INSERT INTO admin_actions (id, actor, surface, tool, detail, at) VALUES (?, ?, ?, ?, ?, unixepoch())",
    )
      .bind(
        `act_${crypto.randomUUID()}`,
        entry.actor,
        entry.surface,
        entry.tool,
        JSON.stringify(filterActionDetail(entry.args)),
      )
      .run();
  } catch {
    // Logging must never break the action it describes (e.g. before the
    // 0007 migration has applied). The write itself already succeeded.
  }
}

export async function listAdminActions(
  env: Env,
  limit = 20,
): Promise<AdminActionRow[]> {
  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM admin_actions ORDER BY at DESC LIMIT ?",
    )
      .bind(Math.min(Math.max(limit, 1), 100))
      .all<Record<string, unknown>>();
    return (results ?? []).map((r) => ({
      id: String(r.id),
      actor: String(r.actor),
      surface: (r.surface as ActionSurface) ?? "agent",
      tool: String(r.tool),
      detail: safeParse(r.detail),
      at: Number(r.at ?? 0),
    }));
  } catch {
    return []; // table may not exist yet — read as "no activity"
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
