import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type {
  IntakeRow,
  IntakeStatus,
  TriageLevel,
  AgentRunKind,
  AgentRunRow,
  AgentRunStatus,
  ChamberRow,
  ChamberScheduleSlot,
  ClinicalAssistKind,
  ClinicalAssistRow,
  DraftRow,
  DraftCitation,
  PatientRow,
  PatientMemory,
  KbDocRow,
  AppointmentRow,
  AppointmentStatus,
  AppointmentEventRow,
  AppointmentEventType,
  AppointmentEventDetail,
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
  session_id: string | null;
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
    session_id: r.session_id ?? null,
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

// ---------------------------------------------------------------------------
// KB docs — registry listing (read-only here; ingest/delete go through
// @drkyana/server's ingestDoc/deleteDoc, which also touch Vectorize).
// ---------------------------------------------------------------------------

interface RawKbDoc {
  id: string;
  title: string;
  source: string | null;
  namespace: string;
  chunk_count: number;
  curated: number;
  created_at: number;
  updated_at: number;
}

function mapKbDoc(r: RawKbDoc): KbDocRow {
  return {
    id: r.id,
    title: r.title,
    source: r.source,
    namespace: r.namespace,
    chunk_count: r.chunk_count ?? 0,
    curated: r.curated === 1,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function listKbDocs(): Promise<KbDocRow[]> {
  const { results } = await db()
    .prepare(`SELECT * FROM kb_docs ORDER BY updated_at DESC LIMIT 200`)
    .all<RawKbDoc>();
  return results.map(mapKbDoc);
}

// ---------------------------------------------------------------------------
// Appointments — the GRANTED visit (distinct from the intake's REQUESTED
// logistics). CRUD + an append-only appointment_events audit trail.
// ---------------------------------------------------------------------------

const VALID_APPT_STATUS = new Set<AppointmentStatus>([
  "proposed",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
]);

interface RawAppointment {
  id: string;
  patient_id: string;
  intake_id: string | null;
  chamber_id: string | null;
  scheduled_at: number;
  duration_min: number;
  status: string;
  note: string | null;
  created_at: number;
  updated_at: number;
}

function mapAppointment(r: RawAppointment): AppointmentRow {
  return {
    id: r.id,
    patient_id: r.patient_id,
    intake_id: r.intake_id,
    chamber_id: r.chamber_id,
    scheduled_at: r.scheduled_at,
    duration_min: r.duration_min ?? 30,
    status: (r.status as AppointmentStatus) ?? "proposed",
    note: r.note,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

interface RawApptEvent {
  id: string;
  appointment_id: string;
  type: string;
  detail: string | null;
  actor: string | null;
  at: number;
}

function mapApptEvent(r: RawApptEvent): AppointmentEventRow {
  return {
    id: r.id,
    appointment_id: r.appointment_id,
    type: r.type as AppointmentEventType,
    detail: parseJson<AppointmentEventDetail>(r.detail, {}),
    actor: r.actor,
    at: r.at,
  };
}

async function recordApptEvent(args: {
  appointmentId: string;
  type: AppointmentEventType;
  detail?: AppointmentEventDetail;
  actor: string | null;
}): Promise<void> {
  await db()
    .prepare(
      `INSERT INTO appointment_events (id, appointment_id, type, detail, actor, at)
       VALUES (?, ?, ?, ?, ?, unixepoch())`,
    )
    .bind(
      genId("evt"),
      args.appointmentId,
      args.type,
      args.detail ? JSON.stringify(args.detail) : null,
      args.actor ?? null,
    )
    .run();
}

export interface AppointmentFilter {
  patientId?: string;
  intakeId?: string;
  status?: AppointmentStatus;
}

export async function listAppointments(
  filter: AppointmentFilter = {},
): Promise<AppointmentRow[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (filter.patientId) {
    where.push("patient_id = ?");
    binds.push(filter.patientId);
  }
  if (filter.intakeId) {
    where.push("intake_id = ?");
    binds.push(filter.intakeId);
  }
  if (filter.status && VALID_APPT_STATUS.has(filter.status)) {
    where.push("status = ?");
    binds.push(filter.status);
  }
  const sql =
    `SELECT * FROM appointments` +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    ` ORDER BY scheduled_at DESC LIMIT 200`;
  const { results } = await db().prepare(sql).bind(...binds).all<RawAppointment>();
  return results.map(mapAppointment);
}

export async function getAppointment(id: string): Promise<AppointmentRow | null> {
  const row = await db()
    .prepare(`SELECT * FROM appointments WHERE id = ?`)
    .bind(id)
    .first<RawAppointment>();
  return row ? mapAppointment(row) : null;
}

export async function getAppointmentEvents(
  appointmentId: string,
): Promise<AppointmentEventRow[]> {
  const { results } = await db()
    .prepare(
      `SELECT * FROM appointment_events WHERE appointment_id = ? ORDER BY at ASC`,
    )
    .bind(appointmentId)
    .all<RawApptEvent>();
  return results.map(mapApptEvent);
}

export interface AppointmentInput {
  patientId: string;
  intakeId?: string | null;
  chamberId?: string | null;
  scheduledAt: number;
  durationMin?: number;
  note?: string | null;
}

export async function createAppointment(
  input: AppointmentInput,
  actor: string | null,
): Promise<AppointmentRow> {
  const id = genId("appt");
  await db()
    .prepare(
      `INSERT INTO appointments (id, patient_id, intake_id, chamber_id, scheduled_at, duration_min, status, note)
       VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?)`,
    )
    .bind(
      id,
      input.patientId,
      input.intakeId ?? null,
      input.chamberId ?? null,
      input.scheduledAt,
      input.durationMin ?? 30,
      input.note ?? null,
    )
    .run();
  await recordApptEvent({
    appointmentId: id,
    type: "created",
    detail: { nextSlot: input.scheduledAt, nextStatus: "proposed" },
    actor,
  });
  return (await getAppointment(id))!;
}

export async function rescheduleAppointment(
  id: string,
  scheduledAt: number,
  actor: string | null,
  reason?: string,
): Promise<AppointmentRow | null> {
  const current = await getAppointment(id);
  if (!current) return null;
  await db()
    .prepare(
      `UPDATE appointments SET scheduled_at = ?, updated_at = unixepoch() WHERE id = ?`,
    )
    .bind(scheduledAt, id)
    .run();
  await recordApptEvent({
    appointmentId: id,
    type: "rescheduled",
    detail: { prevSlot: current.scheduled_at, nextSlot: scheduledAt, reason },
    actor,
  });
  return getAppointment(id);
}

export async function setAppointmentStatus(
  id: string,
  status: AppointmentStatus,
  actor: string | null,
  reason?: string,
): Promise<AppointmentRow | null> {
  if (!VALID_APPT_STATUS.has(status)) throw new Error(`invalid status: ${status}`);
  const current = await getAppointment(id);
  if (!current) return null;
  await db()
    .prepare(`UPDATE appointments SET status = ?, updated_at = unixepoch() WHERE id = ?`)
    .bind(status, id)
    .run();
  await recordApptEvent({
    appointmentId: id,
    type: status as AppointmentEventType,
    detail: { prevStatus: current.status, nextStatus: status, reason },
    actor,
  });
  return getAppointment(id);
}

// ---------------------------------------------------------------------------
// Transcripts — patient chat history (sessions linked to the patient).
// ---------------------------------------------------------------------------

export interface TranscriptSummary {
  sessionId: string;
  created_at: number;
  updated_at: number;
  message_count: number;
  summary: string | null;
}

export interface TranscriptTurn {
  role: string;
  text: string;
}

function messageCount(raw: unknown): number {
  const parsed = parseJson<unknown[]>(typeof raw === "string" ? raw : "[]", []);
  return Array.isArray(parsed) ? parsed.length : 0;
}

export async function listPatientTranscripts(
  patientId: string,
): Promise<TranscriptSummary[]> {
  const { results } = await db()
    .prepare(
      `SELECT id, messages, summary, created_at, updated_at FROM sessions
       WHERE patient_id = ? ORDER BY updated_at DESC LIMIT 50`,
    )
    .bind(patientId)
    .all<{ id: string; messages: string; summary: string | null; created_at: number; updated_at: number }>();
  return results.map((r) => ({
    sessionId: r.id,
    created_at: r.created_at,
    updated_at: r.updated_at,
    message_count: messageCount(r.messages),
    summary: r.summary,
  }));
}

// ---------------------------------------------------------------------------
// Admin assistant sessions — persist/restore the admin chat + list past
// conversations (kind='admin'), so the chat survives navigation and has history.
// ---------------------------------------------------------------------------

export interface AdminSessionSummary {
  sessionId: string;
  updated_at: number;
  snippet: string;
}

function firstUserSnippet(raw: unknown): string {
  const msgs = parseJson<Record<string, unknown>[]>(typeof raw === "string" ? raw : "[]", []);
  for (const m of Array.isArray(msgs) ? msgs : []) {
    if ((m as { role?: unknown }).role !== "user") continue;
    const parts = (m as { parts?: unknown }).parts;
    if (Array.isArray(parts)) {
      const text = parts
        .filter(
          (p): p is { type: string; text: string } =>
            !!p && (p as { type?: string }).type === "text" &&
            typeof (p as { text?: unknown }).text === "string",
        )
        .map((p) => p.text)
        .join("");
      if (text) return text.slice(0, 80);
    }
  }
  return "(no messages)";
}

export async function listAdminSessions(): Promise<AdminSessionSummary[]> {
  const { results } = await db()
    .prepare(
      `SELECT id, messages, updated_at FROM sessions WHERE kind = 'admin'
       ORDER BY updated_at DESC LIMIT 30`,
    )
    .all<{ id: string; messages: string; updated_at: number }>();
  return results.map((r) => ({
    sessionId: r.id,
    updated_at: r.updated_at,
    snippet: firstUserSnippet(r.messages),
  }));
}

/** Raw stored UIMessage[] for an admin session, to seed useChat on restore. */
export async function getAdminSessionMessages(sessionId: string): Promise<unknown[]> {
  const row = await db()
    .prepare(`SELECT messages FROM sessions WHERE id = ? AND kind = 'admin'`)
    .bind(sessionId)
    .first<{ messages: string }>();
  if (!row) return [];
  const parsed = parseJson<unknown[]>(row.messages, []);
  return Array.isArray(parsed) ? parsed : [];
}

export async function getTranscript(
  sessionId: string,
): Promise<{ sessionId: string; created_at: number; turns: TranscriptTurn[] } | null> {
  const row = await db()
    .prepare(`SELECT id, messages, created_at FROM sessions WHERE id = ?`)
    .bind(sessionId)
    .first<{ id: string; messages: string; created_at: number }>();
  if (!row) return null;
  const parsed = parseJson<Record<string, unknown>[]>(row.messages, []);
  const turns: TranscriptTurn[] = (Array.isArray(parsed) ? parsed : [])
    .map((m) => {
      const parts = (m as { parts?: unknown }).parts;
      let text = "";
      if (Array.isArray(parts)) {
        text = parts
          .filter(
            (p): p is { type: string; text: string } =>
              !!p &&
              (p as { type?: string }).type === "text" &&
              typeof (p as { text?: unknown }).text === "string",
          )
          .map((p) => p.text)
          .join("");
      } else if (typeof (m as { content?: unknown }).content === "string") {
        text = (m as { content: string }).content;
      }
      return { role: String((m as { role?: unknown }).role ?? "unknown"), text };
    })
    .filter((t) => t.text !== "");
  return { sessionId: row.id, created_at: row.created_at, turns };
}

// ---------------------------------------------------------------------------
// Clinical assists (plan item 4) — read + supersede.
// ---------------------------------------------------------------------------

function mapClinicalAssist(r: Record<string, unknown>): ClinicalAssistRow {
  return {
    id: String(r.id),
    patient_id: String(r.patient_id),
    intake_id: (r.intake_id as string | null) ?? null,
    kind: (r.kind as ClinicalAssistKind) ?? "differential_diagnosis",
    model_id: String(r.model_id),
    prompt_hash: String(r.prompt_hash),
    output_markdown: String(r.output_markdown ?? ""),
    citations: parseJson<DraftCitation[]>(r.citations, []),
    disclaimer_persisted: Number(r.disclaimer_persisted ?? 0) === 1,
    initiated_by: String(r.initiated_by),
    superseded_by_clinician_note:
      (r.superseded_by_clinician_note as string | null) ?? null,
    superseded_by: (r.superseded_by as string | null) ?? null,
    superseded_at: (r.superseded_at as number | null) ?? null,
    created_at: Number(r.created_at ?? 0),
    updated_at: Number(r.updated_at ?? 0),
  };
}

/** Newest-first list of every assist attached to an intake. */
export async function listClinicalAssistsForIntake(
  intakeId: string,
): Promise<ClinicalAssistRow[]> {
  const { results } = await db()
    .prepare(
      "SELECT * FROM clinical_assists WHERE intake_id = ? ORDER BY created_at DESC",
    )
    .bind(intakeId)
    .all<Record<string, unknown>>();
  return (results ?? []).map(mapClinicalAssist);
}

export async function getClinicalAssist(
  id: string,
): Promise<ClinicalAssistRow | null> {
  const row = await db()
    .prepare("SELECT * FROM clinical_assists WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  return row ? mapClinicalAssist(row) : null;
}

/**
 * Supersede an AI-generated assist with Dr Kyana's clinical note. The original
 * row is preserved (audit) — the note + supersede metadata are added in place.
 * Re-superseding overwrites the prior note; the audit trail is the row's
 * `updated_at`.
 */
export async function setClinicalAssistSupersede(
  id: string,
  note: string,
  supersededBy: string,
): Promise<ClinicalAssistRow | null> {
  const now = Math.floor(Date.now() / 1000);
  await db()
    .prepare(
      "UPDATE clinical_assists SET superseded_by_clinician_note = ?, superseded_by = ?, superseded_at = ?, updated_at = ? WHERE id = ?",
    )
    .bind(note, supersededBy, now, now, id)
    .run();
  return getClinicalAssist(id);
}

// ---------------------------------------------------------------------------
// Agent runs (plan item 5) — deep-research inference runs with cost.
// ---------------------------------------------------------------------------

function mapAgentRun(r: Record<string, unknown>): AgentRunRow {
  return {
    id: String(r.id),
    kind: (r.kind as AgentRunKind) ?? "intake_patterns",
    status: (r.status as AgentRunStatus) ?? "pending",
    input_json: String(r.input_json ?? "{}"),
    output_md: String(r.output_md ?? ""),
    model_id: (r.model_id as string | null) ?? null,
    input_tokens: Number(r.input_tokens ?? 0),
    output_tokens: Number(r.output_tokens ?? 0),
    cost_usd: Number(r.cost_usd ?? 0),
    error: (r.error as string | null) ?? null,
    initiated_by: String(r.initiated_by ?? ""),
    started_at: Number(r.started_at ?? 0),
    finished_at: (r.finished_at as number | null) ?? null,
    created_at: Number(r.created_at ?? 0),
  };
}

/** Newest-first list of recent agent runs. */
export async function listAgentRuns(limit = 30): Promise<AgentRunRow[]> {
  const { results } = await db()
    .prepare("SELECT * FROM agent_runs ORDER BY started_at DESC LIMIT ?")
    .bind(Math.min(Math.max(limit, 1), 100))
    .all<Record<string, unknown>>();
  return (results ?? []).map(mapAgentRun);
}

export async function getAgentRun(id: string): Promise<AgentRunRow | null> {
  const row = await db()
    .prepare("SELECT * FROM agent_runs WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  return row ? mapAgentRun(row) : null;
}
