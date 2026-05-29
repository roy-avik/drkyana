/**
 * Shared admin-tool helpers — D1 row fetch + parse for intakes and patient
 * memory, reused by get_intake, the draft_* tools, and the radiology subagent.
 * Server-only; all reads are parameterized.
 */
import type {
  IntakeRow,
  PatientMemory,
  IntakeStatus,
  TriageLevel,
  TriageAction,
  Gender,
} from "@drkyana/types";
import type { Env } from "../../bindings";

export const EMPTY_MEMORY: PatientMemory = {
  conditions: [],
  allergies: [],
  medications: [],
  recurring_complaints: [],
  flags: [],
};

export function parseMemory(raw: unknown): PatientMemory {
  if (typeof raw !== "string" || raw === "") return { ...EMPTY_MEMORY };
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
    return { ...EMPTY_MEMORY };
  }
}

function parseArray(raw: unknown): string[] {
  if (typeof raw !== "string" || raw === "") return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

export function mapIntake(r: Record<string, unknown>): IntakeRow {
  return {
    id: String(r.id),
    patient_id: (r.patient_id as string | null) ?? null,
    name: (r.name as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    age: (r.age as number | null) ?? null,
    gender: (r.gender as Gender | null) ?? null,
    affected_area: (r.affected_area as string | null) ?? null,
    symptoms: (r.symptoms as string | null) ?? null,
    duration: (r.duration as string | null) ?? null,
    severity: (r.severity as number | null) ?? null,
    triggers: (r.triggers as string | null) ?? null,
    conditions: parseArray(r.conditions),
    allergies: parseArray(r.allergies),
    medications: parseArray(r.medications),
    last_dental_visit: (r.last_dental_visit as string | null) ?? null,
    anxiety: (r.anxiety as string | null) ?? null,
    preferred_area: (r.preferred_area as string | null) ?? null,
    preferred_days: (r.preferred_days as string | null) ?? null,
    time_of_day: (r.time_of_day as string | null) ?? null,
    urgency: (r.urgency as string | null) ?? null,
    payment: (r.payment as string | null) ?? null,
    triage_level: (r.triage_level as TriageLevel | null) ?? null,
    triage_action: (r.triage_action as TriageAction | null) ?? null,
    status: (r.status as IntakeStatus) ?? "new",
    raw_message: (r.raw_message as string | null) ?? null,
    created_at: Number(r.created_at ?? 0),
    updated_at: Number(r.updated_at ?? 0),
  };
}

export async function fetchIntake(
  env: Env,
  intakeId: string,
): Promise<IntakeRow | null> {
  const row = await env.DB.prepare("SELECT * FROM intakes WHERE id = ?")
    .bind(intakeId)
    .first<Record<string, unknown>>();
  return row ? mapIntake(row) : null;
}

export interface PatientMemoryView {
  patientId: string;
  name: string | null;
  summary: string;
  memory: PatientMemory;
  lastVisit: number | null;
  visitCount: number;
}

export async function fetchPatientMemory(
  env: Env,
  patientId: string,
): Promise<PatientMemoryView | null> {
  const row = await env.DB.prepare(
    "SELECT id, name, summary, memory, last_visit, visit_count FROM patients WHERE id = ?",
  )
    .bind(patientId)
    .first<Record<string, unknown>>();
  if (!row) return null;
  return {
    patientId: String(row.id),
    name: (row.name as string | null) ?? null,
    summary: String(row.summary ?? ""),
    memory: parseMemory(row.memory),
    lastVisit: (row.last_visit as number | null) ?? null,
    visitCount: Number(row.visit_count ?? 0),
  };
}

/** Dedupe + trim a set of string facts; drops empties and literal "none". */
export function mergeFacts(...lists: (string[] | undefined)[]): string[] {
  const out = new Set<string>();
  for (const list of lists)
    for (const v of list ?? []) {
      const s = (v ?? "").trim();
      if (s && s.toLowerCase() !== "none") out.add(s);
    }
  return [...out];
}
