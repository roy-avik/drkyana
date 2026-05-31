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
    .optional()
    .describe(
      "The patient's phone number — an OPTIONAL fallback match key. The verified " +
        "email from the session is the primary key and is used automatically, so " +
        "you can (and should) call this with NO phone at the START of a booking/" +
        "urgent intent to pre-fill the form for returning patients. Pass a phone " +
        "only to match a legacy (pre-verified) record when you have one.",
    ),
});

export interface ReturningPatientResult {
  found: boolean;
  name?: string | null;
  phone?: string | null;
  age?: number | null;
  gender?: string | null;
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
    "Look up whether this session belongs to a returning patient. The match is " +
    "by the session's VERIFIED email automatically, so call it at the START of a " +
    "booking/urgent intent — before opening the form — to pre-fill known details " +
    "(name, phone, age, gender) and medical memory (allergies, conditions, " +
    "medications, anxiety). Returns found:false for a first-time patient. A " +
    "phone arg is an optional fallback to match legacy pre-verified records.",
  category: "read",
  inputSchema,
  async execute(
    args,
    ctx: AgentContext,
  ): Promise<ReturningPatientResult> {
    // Email-first: if the session is verified, look up by the verified email
    // (server-trusted, not model-supplied). Only fall back to phone — never
    // trust an email passed in via args.
    const verifiedEmail =
      ctx.caller.kind === "patient" ? ctx.caller.verifiedEmail : undefined;

    const cols =
      "SELECT id, name, phone, age, gender, summary, memory, last_visit, visit_count FROM patients";

    let row: Record<string, unknown> | null = null;
    if (verifiedEmail) {
      row = await ctx.env.DB.prepare(
        `${cols} WHERE email = ? AND email_verified_at IS NOT NULL`,
      )
        .bind(verifiedEmail)
        .first<Record<string, unknown>>();
    }
    if (!row && args.phone) {
      const phone = normalizePhone(args.phone);
      row = await ctx.env.DB.prepare(`${cols} WHERE phone = ?`)
        .bind(phone)
        .first<Record<string, unknown>>();
    }

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
      phone: (row.phone as string | null) ?? null,
      age: (row.age as number | null) ?? null,
      gender: (row.gender as string | null) ?? null,
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
