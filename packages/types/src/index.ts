/**
 * @drkyana/types — shared types ONLY.
 *
 * Hard rule (code-isolation): this package must contain NO prompts, no tool
 * implementations, no business logic. It is the one package safe to import
 * from both client bundles (patient + admin) and the server. Anything secret
 * or model-facing lives in @drkyana/server, which clients must never import.
 */

// Patient intake form schema (PR-C form-first flow).
export * from "./intake-form";

// ---------------------------------------------------------------------------
// Enums / unions
// ---------------------------------------------------------------------------

export type Locale = "en" | "fa" | "bn";

export type Gender = "female" | "male" | "other" | "unspecified";

export type TriageLevel = "RED" | "ORANGE" | "YELLOW" | "GREEN";
export type TriageAction = "fast_track" | "priority" | "normal";

export type IntakeStatus =
  | "new"
  | "contacted"
  | "scheduled"
  | "completed"
  | "closed";

export type DraftType =
  | "aftercare"
  | "clinical_note"
  | "referral"
  | "certificate"
  | "prescription"
  | "radiology";

export type DraftStatus = "draft" | "approved" | "sent";

export type SessionKind = "patient" | "admin";

/**
 * Kind of AI-generated clinical reasoning persisted in `clinical_assists`
 * (plan item 4). One row per generation. New kinds can be added without
 * schema changes — the table is shaped around provenance, not content type.
 */
export type ClinicalAssistKind = "differential_diagnosis";

export type AppointmentStatus =
  | "proposed"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

/** Lifecycle events recorded on appointment_events (reschedule/cancel history). */
export type AppointmentEventType =
  | "created"
  | "rescheduled"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

// ---------------------------------------------------------------------------
// Patient longitudinal record
// ---------------------------------------------------------------------------

/**
 * Structured patient memory. STRUCTURED facts are merged from intake fields
 * and are never invented by the model. The narrative `summary` (on the row)
 * is LLM-composed but human-approved.
 */
export interface PatientMemory {
  conditions: string[];
  allergies: string[];
  medications: string[];
  dental_history?: string;
  anxiety?: string;
  recurring_complaints: string[];
  flags: string[];
}

export interface PatientRow {
  id: string;
  phone: string;
  name?: string | null;
  age?: number | null;
  gender?: Gender | null;
  email?: string | null;
  summary: string;
  memory: PatientMemory; // parsed from TEXT(JSON)
  last_visit?: number | null;
  visit_count: number;
  created_at: number;
  updated_at: number;
}

// ---------------------------------------------------------------------------
// Intake (per visit)
// ---------------------------------------------------------------------------

export interface IntakeRow {
  id: string;
  patient_id?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  age?: number | null;
  gender?: Gender | null;
  affected_area?: string | null;
  symptoms?: string | null;
  duration?: string | null;
  severity?: number | null;
  triggers?: string | null;
  conditions: string[];
  allergies: string[];
  medications: string[];
  last_dental_visit?: string | null;
  anxiety?: string | null;
  preferred_area?: string | null;
  preferred_days?: string | null;
  time_of_day?: string | null;
  urgency?: string | null;
  payment?: string | null;
  triage_level?: TriageLevel | null;
  triage_action?: TriageAction | null;
  status: IntakeStatus;
  raw_message?: string | null;
  /** Originating conversation (sessions.id). Set at submit time. */
  session_id?: string | null;
  created_at: number;
  updated_at: number;
}

// ---------------------------------------------------------------------------
// Appointments — what was GRANTED (vs. the intake logistics, what was sought)
// ---------------------------------------------------------------------------

export interface AppointmentRow {
  id: string;
  patient_id: string;
  intake_id?: string | null;
  chamber_id?: string | null;
  scheduled_at: number; // unix epoch seconds
  duration_min: number;
  status: AppointmentStatus;
  note?: string | null;
  created_at: number;
  updated_at: number;
}

/** Parsed `detail` JSON of an appointment event. */
export interface AppointmentEventDetail {
  prevSlot?: number | null;
  nextSlot?: number | null;
  prevStatus?: AppointmentStatus | null;
  nextStatus?: AppointmentStatus | null;
  reason?: string | null;
}

export interface AppointmentEventRow {
  id: string;
  appointment_id: string;
  type: AppointmentEventType;
  detail: AppointmentEventDetail; // parsed from TEXT(JSON)
  actor?: string | null;
  at: number;
}

// ---------------------------------------------------------------------------
// Chambers
// ---------------------------------------------------------------------------

export interface ChamberScheduleSlot {
  day: string; // "mon".."sun"
  from: string; // "09:00"
  to: string; // "13:00"
}

export interface ChamberRow {
  id: string;
  name: string;
  area: string;
  address?: string | null;
  services: string[];
  schedule: ChamberScheduleSlot[];
  active: boolean;
  created_at: number;
  updated_at: number;
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

export interface DraftCitation {
  kbDocId: string;
  title: string;
  snippet?: string;
}

export interface DraftRow {
  id: string;
  type: DraftType;
  patient_id?: string | null;
  intake_id?: string | null;
  title?: string | null;
  markdown: string;
  citations: DraftCitation[];
  pdf_r2_key?: string | null;
  status: DraftStatus;
  created_at: number;
  updated_at: number;
}

/**
 * Clinical assist row — audit-grade record of AI-generated clinical reasoning
 * (plan item 4). One row per generation; the row is discoverable and stamped
 * with provenance (model id, prompt hash, initiator). `disclaimer_persisted`
 * means the admin UI renders the "AI-assisted, not a diagnosis" banner above
 * the output. `superseded_*` is Dr Kyana's authoritative override.
 */
export interface ClinicalAssistRow {
  id: string;
  patient_id: string;
  intake_id: string | null;
  kind: ClinicalAssistKind;
  model_id: string;
  prompt_hash: string;
  output_markdown: string;
  citations: DraftCitation[];
  disclaimer_persisted: boolean;
  initiated_by: string;
  superseded_by_clinician_note: string | null;
  superseded_by: string | null;
  superseded_at: number | null;
  created_at: number;
  updated_at: number;
}

// ---------------------------------------------------------------------------
// Knowledge base registry
// ---------------------------------------------------------------------------

export interface KbDocRow {
  id: string;
  title: string;
  source?: string | null;
  namespace: string;
  chunk_count: number;
  curated: boolean;
  created_at: number;
  updated_at: number;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export interface SessionRow {
  id: string;
  kind: SessionKind;
  patient_id?: string | null;
  messages: unknown[]; // AI SDK UIMessage[] — kept opaque here to avoid a client dep
  summary?: string | null;
  locale?: Locale | null;
  ip_hash?: string | null;
  created_at: number;
  updated_at: number;
}

// ---------------------------------------------------------------------------
// Background jobs (radiology, pdf) — status persisted to KV, polled by the UI
// ---------------------------------------------------------------------------

export type JobKind = "radiology" | "compile_pdf";
export type JobStatus = "pending" | "running" | "done" | "error";

export interface JobRecord<TResult = unknown> {
  id: string;
  kind: JobKind;
  status: JobStatus;
  progress?: string; // human-readable step label
  result?: TResult;
  error?: string;
  created_at: number;
  updated_at: number;
}

export interface RadiologyResult {
  draftMarkdown: string; // "draft observations" — never a definitive diagnosis
  citations: DraftCitation[];
  imageR2Key: string;
}

export interface CompilePdfResult {
  pdfR2Key: string;
  draftId: string;
}

// ---------------------------------------------------------------------------
// Agent wire types (client <-> server). Note: tool *definitions* and prompts
// live in @drkyana/server; these are only the shapes crossing the boundary.
// ---------------------------------------------------------------------------

export interface AgentChatRequest {
  sessionId: string;
  message: string;
  locale?: Locale;
}

/** A redactable, non-sensitive view of a tool invocation for the UI timeline. */
export interface ToolInvocationView {
  toolName: string;
  state: "call" | "result" | "awaiting-approval" | "error";
}
