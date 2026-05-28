/**
 * suggest_chamber — read active chambers from D1 and score them against the
 * patient's preferences. Scoring ported from the retired on-device
 * `src/services/chambers.ts#suggestChamber` (service match → area → day overlap).
 *
 * PRIVACY: never returns a street address. The result exposes only the chamber
 * NAME + AREA — the exact location is confirmed by Dr Kyana's team when booking.
 *
 * category 'read': SELECT only.
 */
import { z } from "zod";
import type { ChamberRow, ChamberScheduleSlot } from "@drkyana/types";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";

const inputSchema = z.object({
  visitType: z
    .string()
    .optional()
    .describe(
      "Kind of visit: 'cleaning'/'scaling', 'rct'/'root canal', 'checkup', 'consult', 'filling', or 'other'.",
    ),
  preferredArea: z
    .string()
    .optional()
    .describe("Area of Dhaka the patient prefers, e.g. 'Dhanmondi'."),
  preferredDays: z
    .array(z.string())
    .optional()
    .describe("Days that work for the patient, e.g. ['sat','sun']."),
});

/** Compact, privacy-safe suggestion — NO address. */
export interface ChamberSuggestion {
  name: string;
  area: string;
  /** Days (e.g. ['sat','mon']) derived from the schedule — coarse, no address. */
  days: string[];
}

// Map visit types onto chamber capability tags (matches the retired logic).
const CAPABILITY_MAP: Record<string, string> = {
  scaling: "scaling",
  cleaning: "scaling",
  rct: "rct",
  checkup: "general",
  consult: "general",
  filling: "general",
  other: "general",
};

interface ParsedChamber {
  name: string;
  area: string;
  services: string[];
  days: string[];
}

function parseRow(row: Record<string, unknown>): ParsedChamber {
  const services = safeJsonArray<string>(row.services);
  const schedule = safeJsonArray<ChamberScheduleSlot>(row.schedule);
  const days = Array.from(
    new Set(
      schedule
        .map((s) => (s && typeof s.day === "string" ? s.day : ""))
        .filter(Boolean),
    ),
  );
  return {
    name: String(row.name ?? ""),
    area: String(row.area ?? ""),
    services,
    days,
  };
}

function safeJsonArray<T = unknown>(v: unknown): T[] {
  if (typeof v !== "string") return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function score(
  c: ParsedChamber,
  args: z.infer<typeof inputSchema>,
): number {
  let s = 0;

  // Service match (hard filter — capability missing disqualifies the chamber).
  if (args.visitType) {
    const needed = CAPABILITY_MAP[args.visitType] ?? "general";
    if (!c.services.includes(needed)) return -1;
    s += 10;
  }

  // Area match.
  if (args.preferredArea && c.area) {
    const pArea = args.preferredArea.toLowerCase();
    const cArea = c.area.toLowerCase();
    if (cArea.includes(pArea) || pArea.includes(cArea)) s += 5;
  }

  // Day overlap.
  if (args.preferredDays && args.preferredDays.length > 0) {
    const cDays = new Set(c.days.map((d) => d.toLowerCase()));
    const overlap = args.preferredDays.filter((d) => cDays.has(d.toLowerCase()));
    s += overlap.length;
  }

  return s;
}

export const suggestChamberTool = defineTool({
  name: "suggest_chamber",
  description:
    "Suggest the best-fitting active chamber for the patient by service, area, " +
    "and day preference. Returns chamber NAME + AREA only — never an address. " +
    "The exact location is confirmed by Dr Kyana's team when the visit is booked.",
  category: "read",
  inputSchema,
  async execute(
    args,
    ctx: AgentContext,
  ): Promise<ChamberSuggestion | { suggestion: null }> {
    const { results } = await ctx.env.DB.prepare(
      "SELECT name, area, services, schedule FROM chambers WHERE active = 1",
    ).all<Record<string, unknown>>();

    const parsed = (results ?? []).map(parseRow);
    if (parsed.length === 0) return { suggestion: null };

    const ranked = parsed
      .map((c) => ({ c, s: score(c, args) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s);

    if (ranked.length === 0) return { suggestion: null };

    const best = ranked[0].c;
    return { name: best.name, area: best.area, days: best.days };
  },
});
