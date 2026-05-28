/**
 * lookup_returning_patient — match a patient by phone in D1 and, if found,
 * return their narrative `summary` + parsed structured `memory` so the agent
 * has continuity across visits ("recurring lower-left pain, penicillin allergy").
 *
 * AUTHZ: scoped to the caller's own record. A patient session is bound to a
 * patient id the first time their phone resolves; once bound, `assertOwnPatient`
 * blocks reading anyone else's record. Result is compact (no raw rows).
 *
 * category 'read': SELECT only.
 */
import { z } from "zod";
import type { PatientMemory } from "@drkyana/types";
import { defineTool } from "../../tools";
import { assertOwnPatient, type AgentContext } from "../../context";

const inputSchema = z.object({
  phone: z
    .string()
    .min(3)
    .describe("The patient's phone number, used as the match key."),
});

export interface ReturningPatientResult {
  found: boolean;
  name?: string | null;
  summary?: string;
  memory?: PatientMemory;
  lastVisit?: number | null;
  visitCount?: number;
}

const EMPTY_MEMORY: PatientMemory = {
  conditions: [],
  allergies: [],
  medications: [],
  recurring_complaints: [],
  flags: [],
};

function parseMemory(raw: unknown): PatientMemory {
  if (typeof raw !== "string") return EMPTY_MEMORY;
  try {
    const m = JSON.parse(raw) as Partial<PatientMemory>;
    return {
      conditions: m.conditions ?? [],
      allergies: m.allergies ?? [],
      medications: m.medications ?? [],
      dental_history: m.dental_history,
      anxiety: m.anxiety,
      recurring_complaints: m.recurring_complaints ?? [],
      flags: m.flags ?? [],
    };
  } catch {
    return EMPTY_MEMORY;
  }
}

export const lookupReturningPatientTool = defineTool({
  name: "lookup_returning_patient",
  description:
    "Look up whether this phone belongs to a returning patient. If found, " +
    "returns their summary and structured medical memory (allergies, " +
    "conditions, medications, recurring complaints) for continuity. " +
    "Use it after the patient gives their phone number.",
  category: "read",
  inputSchema,
  async execute(
    args,
    ctx: AgentContext,
  ): Promise<ReturningPatientResult> {
    const phone = normalizePhone(args.phone);
    const row = await ctx.env.DB.prepare(
      "SELECT id, name, summary, memory, last_visit, visit_count FROM patients WHERE phone = ?",
    )
      .bind(phone)
      .first<Record<string, unknown>>();

    if (!row) return { found: false };

    const patientId = String(row.id);
    // If this session is already bound to a patient, enforce it owns this row.
    // (An unbound patient session is binding to its own record on first lookup.)
    if (ctx.caller.kind === "patient" && ctx.caller.patientId) {
      assertOwnPatient(ctx, patientId);
    }

    return {
      found: true,
      name: (row.name as string | null) ?? null,
      summary: String(row.summary ?? ""),
      memory: parseMemory(row.memory),
      lastVisit: (row.last_visit as number | null) ?? null,
      visitCount: Number(row.visit_count ?? 0),
    };
  },
});

/** Trim whitespace; keep digits and a leading '+'. Match key is forgiving. */
function normalizePhone(phone: string): string {
  return phone.trim();
}
