import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type {
  IntakeRow,
  IntakeStatus,
  TriageLevel,
  ChamberRow,
  ChamberScheduleSlot,
  DraftRow,
  DraftCitation,
  PatientRow,
  PatientMemory,
} from "@drkyana/types";

/**
 * Management data access (server-only).
 *
 * Plain, parameterized D1 queries against the bindings exposed by
 * getCloudflareContext().env.DB. This is intentionally disjoint from
 * @drkyana/server — the management CRUD does NOT go through the agent tool
 * registry; it reads D1 directly. Row shapes come from @drkyana/types.
 *
 * Only route handlers / server actions call into this module.
 */

function db() {
  return getCloudflareContext().env.DB;
}

// ---------------------------------------------------------------------------
// JSON column helpers — D1 stores JSON-shaped columns as TEXT.
// ---------------------------------------------------------------------------

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value === "") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function emptyMemory(): PatientMemory {
  return {
    conditions: [],
    allergies: [],
    medications: [],
    recurring_complaints: [],
    flags: [],
  };
}

// Raw DB row (everything is TEXT/INTEGER) → typed row mappers.

interface RawIntake {
  id: string;
  patient_id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  age: number | null;
  gender: string | null;
  affected_area: string | null;
  symptoms: string | null;
  duration: string | null;
  severity: number | null;
  triggers: string | null;
  conditions: string;
  allergies: string;
  medications: string;
  last_dental_visit: string | null;
  anxiety: string | null;
  preferred_area: string | null;
  preferred_days: string | null;
  time_of_day: string | null;
  urgency: string | null;
  payment: string | null;
  triage_level: string | null;
  triage_action: string | null;
  status: string;
  raw_message: string | null;
  created_at: number;
  updated_at: number;
}

function mapIntake(r: RawIntake): IntakeRow {
  return {
    id: r.id,
    patient_id: r.patient_id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    age: r.age,
    gender: (r.gender as IntakeRow["gender"]) ?? null,
    affected_area: r.affected_area,
    symptoms: r.symptoms,
    duration: r.duration,
    severity: r.severity,
    triggers: r.triggers,
    conditions: parseJson<string[]>(r.conditions, []),
    allergies: parseJson<string[]>(r.allergies, []),
    medications: parseJson<string[]>(r.medications, []),
    last_dental_visit: r.last_dental_visit,
    anxiety: r.anxiety,
    preferred_area: r.preferred_area,
    preferred_days: r.preferred_days,
    time_of_day: r.time_of_day,
    urgency: r.urgency,
    payment: r.payment,
    triage_level: (r.triage_level as TriageLevel) ?? null,
    triage_action: (r.triage_action as IntakeRow["triage_action"]) ?? null,
    status: (r.status as IntakeStatus) ?? "new",
    raw_message: r.raw_message,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

interface RawChamber {
  id: string;
  name: string;
  area: string;
  address: string | null;
  services: string;
  schedule: string;
  active: number;
  created_at: number;
  updated_at: number;
}

function mapChamber(r: RawChamber): ChamberRow {
  return {
    id: r.id,
    name: r.name,
    area: r.area,
    address: r.address,
    services: parseJson<string[]>(r.services, []),
    schedule: parseJson<ChamberScheduleSlot[]>(r.schedule, []),
    active: r.active === 1,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

interface RawDraft {
  id: string;
  type: string;
  patient_id: string | null;
  intake_id: string | null;
  title: string | null;
  markdown: string;
  citations: string;
  pdf_r2_key: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

function mapDraft(r: RawDraft): DraftRow {
  return {
    id: r.id,
    type: r.type as DraftRow["type"],
    patient_id: r.patient_id,
    intake_id: r.intake_id,
    title: r.title,
    markdown: r.markdown,
    citations: parseJson<DraftCitation[]>(r.citations, []),
    pdf_r2_key: r.pdf_r2_key,
    status: r.status as DraftRow["status"],
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

interface RawPatient {
  id: string;
  phone: string;
  name: string | null;
  age: number | null;
  gender: string | null;
  email: string | null;
  summary: string;
  memory: string;
  last_visit: number | null;
  visit_count: number;
  created_at: number;
  updated_at: number;
}

function mapPatient(r: RawPatient): PatientRow {
  return {
    id: r.id,
    phone: r.phone,
    name: r.name,
    age: r.age,
    gender: (r.gender as PatientRow["gender"]) ?? null,
    email: r.email,
    summary: r.summary ?? "",
    memory: parseJson<PatientMemory>(r.memory, emptyMemory()),
    last_visit: r.last_visit,
    visit_count: r.visit_count ?? 0,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Intakes
// ---------------------------------------------------------------------------

export interface IntakeFilter {
  status?: IntakeStatus;
  triage?: TriageLevel[];
  since?: number; // unix seconds, created_at >= since
  until?: number; // unix seconds, created_at <= until
  limit?: number;
}

const VALID_STATUS = new Set<IntakeStatus>([
  "new",
  "contacted",
  "scheduled",
  "completed",
  "closed",
]);
const VALID_TRIAGE = new Set<TriageLevel>(["RED", "ORANGE", "YELLOW", "GREEN"]);

export async function listIntakes(filter: IntakeFilter = {}): Promise<IntakeRow[]> {
  const where: string[] = [];
  const binds: unknown[] = [];

  if (filter.status && VALID_STATUS.has(filter.status)) {
    where.push("status = ?");
    binds.push(filter.status);
  }
  const triage = (filter.triage ?? []).filter((t) => VALID_TRIAGE.has(t));
  if (triage.length) {
    where.push(`triage_level IN (${triage.map(() => "?").join(",")})`);
    binds.push(...triage);
  }
  if (typeof filter.since === "number") {
    where.push("created_at >= ?");
    binds.push(filter.since);
  }
  if (typeof filter.until === "number") {
    where.push("created_at <= ?");
    binds.push(filter.until);
  }

  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 500);
  const sql =
    `SELECT * FROM intakes` +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    // Urgent first (RED < ORANGE < YELLOW < GREEN), then newest.
    ` ORDER BY CASE triage_level WHEN 'RED' THEN 0 WHEN 'ORANGE' THEN 1 WHEN 'YELLOW' THEN 2 WHEN 'GREEN' THEN 3 ELSE 4 END, created_at DESC` +
    ` LIMIT ?`;
  binds.push(limit);

  const { results } = await db().prepare(sql).bind(...binds).all<RawIntake>();
  return results.map(mapIntake);
}

export async function getIntake(id: string): Promise<IntakeRow | null> {
  const row = await db()
    .prepare(`SELECT * FROM intakes WHERE id = ?`)
    .bind(id)
    .first<RawIntake>();
  return row ? mapIntake(row) : null;
}

export async function updateIntakeStatus(
  id: string,
  status: IntakeStatus,
): Promise<IntakeRow | null> {
  if (!VALID_STATUS.has(status)) throw new Error(`invalid status: ${status}`);
  await db()
    .prepare(
      `UPDATE intakes SET status = ?, updated_at = unixepoch() WHERE id = ?`,
    )
    .bind(status, id)
    .run();
  return getIntake(id);
}

// ---------------------------------------------------------------------------
// Patients (read-only display of summary/memory)
// ---------------------------------------------------------------------------

export async function getPatient(id: string): Promise<PatientRow | null> {
  const row = await db()
    .prepare(`SELECT * FROM patients WHERE id = ?`)
    .bind(id)
    .first<RawPatient>();
  return row ? mapPatient(row) : null;
}

// ---------------------------------------------------------------------------
// Chambers — CRUD
// ---------------------------------------------------------------------------

export async function listChambers(includeInactive = true): Promise<ChamberRow[]> {
  const sql = includeInactive
    ? `SELECT * FROM chambers ORDER BY active DESC, name ASC`
    : `SELECT * FROM chambers WHERE active = 1 ORDER BY name ASC`;
  const { results } = await db().prepare(sql).all<RawChamber>();
  return results.map(mapChamber);
}

export async function getChamber(id: string): Promise<ChamberRow | null> {
  const row = await db()
    .prepare(`SELECT * FROM chambers WHERE id = ?`)
    .bind(id)
    .first<RawChamber>();
  return row ? mapChamber(row) : null;
}

export interface ChamberInput {
  name: string;
  area: string;
  address?: string | null;
  services?: string[];
  schedule?: ChamberScheduleSlot[];
  active?: boolean;
}

function genId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export async function createChamber(input: ChamberInput): Promise<ChamberRow> {
  const id = genId("ch");
  await db()
    .prepare(
      `INSERT INTO chambers (id, name, area, address, services, schedule, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.name,
      input.area,
      input.address ?? null,
      JSON.stringify(input.services ?? []),
      JSON.stringify(input.schedule ?? []),
      input.active === false ? 0 : 1,
    )
    .run();
  return (await getChamber(id))!;
}

export async function updateChamber(
  id: string,
  input: Partial<ChamberInput>,
): Promise<ChamberRow | null> {
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (input.name !== undefined) {
    sets.push("name = ?");
    binds.push(input.name);
  }
  if (input.area !== undefined) {
    sets.push("area = ?");
    binds.push(input.area);
  }
  if (input.address !== undefined) {
    sets.push("address = ?");
    binds.push(input.address);
  }
  if (input.services !== undefined) {
    sets.push("services = ?");
    binds.push(JSON.stringify(input.services));
  }
  if (input.schedule !== undefined) {
    sets.push("schedule = ?");
    binds.push(JSON.stringify(input.schedule));
  }
  if (input.active !== undefined) {
    sets.push("active = ?");
    binds.push(input.active ? 1 : 0);
  }
  if (!sets.length) return getChamber(id);
  sets.push("updated_at = unixepoch()");
  binds.push(id);
  await db()
    .prepare(`UPDATE chambers SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds)
    .run();
  return getChamber(id);
}

export async function deactivateChamber(id: string): Promise<ChamberRow | null> {
  await db()
    .prepare(`UPDATE chambers SET active = 0, updated_at = unixepoch() WHERE id = ?`)
    .bind(id)
    .run();
  return getChamber(id);
}

// ---------------------------------------------------------------------------
// Drafts — list + fetch one for review
// ---------------------------------------------------------------------------

export async function listDrafts(status?: DraftRow["status"]): Promise<DraftRow[]> {
  const valid = new Set(["draft", "approved", "sent"]);
  const sql = status && valid.has(status)
    ? `SELECT * FROM drafts WHERE status = ? ORDER BY created_at DESC LIMIT 200`
    : `SELECT * FROM drafts ORDER BY created_at DESC LIMIT 200`;
  const stmt = status && valid.has(status)
    ? db().prepare(sql).bind(status)
    : db().prepare(sql);
  const { results } = await stmt.all<RawDraft>();
  return results.map(mapDraft);
}

export async function getDraft(id: string): Promise<DraftRow | null> {
  const row = await db()
    .prepare(`SELECT * FROM drafts WHERE id = ?`)
    .bind(id)
    .first<RawDraft>();
  return row ? mapDraft(row) : null;
}

export async function updateDraftMarkdown(
  id: string,
  markdown: string,
): Promise<DraftRow | null> {
  await db()
    .prepare(`UPDATE drafts SET markdown = ?, updated_at = unixepoch() WHERE id = ?`)
    .bind(markdown, id)
    .run();
  return getDraft(id);
}

export async function updateDraftStatus(
  id: string,
  status: DraftRow["status"],
): Promise<DraftRow | null> {
  const valid = new Set(["draft", "approved", "sent"]);
  if (!valid.has(status)) throw new Error(`invalid draft status: ${status}`);
  await db()
    .prepare(`UPDATE drafts SET status = ?, updated_at = unixepoch() WHERE id = ?`)
    .bind(status, id)
    .run();
  return getDraft(id);
}
