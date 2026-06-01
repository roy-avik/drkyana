/**
 * submit_intake — the patient's one write. Upserts the `patients` row (matched
 * by phone), inserts a linked `intakes` row, runs deterministic triage, and
 * stamps the intake with triage_level/action + status='new'.
 *
 * needsApproval is FALSE here: the patient IS the one submitting their own
 * intake, so there is no "agent drafts / dentist approves" gate on this write.
 * (Contrast with admin write tools, which default to needsApproval: true.)
 *
 * Structured patient memory (allergies/conditions/medications/etc.) is MERGED
 * from the intake's structured fields — never invented. The narrative summary is
 * left for Dr Kyana's review/regeneration in the admin app.
 *
 * category 'write'.
 */
import { z } from "zod";
import type {
  PatientMemory,
  TriageLevel,
  TriageAction,
} from "@drkyana/types";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assessTriage } from "./run_triage";
import { sendEmail } from "../../email";

const genderEnum = z.enum(["female", "male", "other", "unspecified"]);

const inputSchema = z.object({
  // identity — NOTE: `name` is intentionally absent. The patient's name is PII
  // and never reaches the model; the server holds the real name on the session
  // (ctx.caller.patientName) and this tool reads it from there, never from args.
  phone: z.string().min(3).describe("Match key for the patient record."),
  email: z.string().optional(),
  age: z.number().int().min(0).max(120).optional(),
  gender: genderEnum.optional(),
  // complaint
  affectedArea: z.string().optional(),
  symptoms: z.array(z.string()).optional(),
  duration: z.string().optional(),
  severity: z.number().int().min(0).max(10).optional(),
  triggers: z.array(z.string()).optional(),
  // medical history
  conditions: z.array(z.string()).optional(),
  allergies: z.array(z.string()).optional(),
  medications: z.array(z.string()).optional(),
  // dental history
  lastDentalVisit: z.string().optional(),
  anxiety: z.string().optional(),
  // logistics
  preferredArea: z.string().optional(),
  preferredDays: z.string().optional(),
  timeOfDay: z.string().optional(),
  urgency: z.string().optional(),
  payment: z.string().optional(),
  // audit
  rawMessage: z.string().optional(),
});

export interface SubmitIntakeResult {
  ok: true;
  intakeId: string;
  patientId: string;
  triageLevel: TriageLevel;
  triageAction: TriageAction;
  returning: boolean;
}

function uniq(...lists: (string[] | undefined)[]): string[] {
  const out = new Set<string>();
  for (const list of lists)
    for (const v of list ?? []) {
      const s = v.trim();
      if (s && s.toLowerCase() !== "none") out.add(s);
    }
  return [...out];
}

function parseMemory(raw: unknown): PatientMemory {
  const empty: PatientMemory = {
    conditions: [],
    allergies: [],
    medications: [],
    recurring_complaints: [],
    flags: [],
  };
  if (typeof raw !== "string") return empty;
  try {
    const m = JSON.parse(raw) as Partial<PatientMemory>;
    return { ...empty, ...m };
  } catch {
    return empty;
  }
}

export const submitIntakeTool = defineTool({
  name: "submit_intake",
  description:
    "Submit the collected intake to Dr Kyana. Upserts the patient (matched by " +
    "verified email when available, otherwise phone), records the visit, and " +
    "runs triage. Call this AFTER the intake form returns its values. The " +
    "patient's email was already verified before the conversation, so the " +
    "server attaches it automatically — you do not collect or pass an email.",
  category: "write",
  needsApproval: false, // the patient is submitting their own intake — no gate.
  inputSchema,
  async execute(args, ctx: AgentContext): Promise<SubmitIntakeResult> {
    // --- Verification gate (plan item 1) ---
    // Defense in depth: the patient endpoint already rejects unverified
    // sessions before the agent runs, so a patient context here is always
    // verified. We still read verifiedEmail from ctx.caller (set by the Pages
    // Function from sessions.verified_email — never model args) and refuse if
    // somehow absent.
    if (ctx.caller.kind !== "patient") {
      throw new Error("submit_intake: patient context required");
    }
    const verifiedEmail = ctx.caller.verifiedEmail;
    if (!verifiedEmail) {
      throw new Error("verification_required: session is not email-verified");
    }
    // Real name comes from the session (server-held), NEVER from model args —
    // the model only ever saw PATIENT_NAME_TOKEN. May be undefined for a
    // returning patient who didn't change their name; COALESCE keeps the prior.
    const patientName = ctx.caller.patientName ?? null;

    const db = ctx.env.DB;
    const now = Math.floor(Date.now() / 1000);
    const phone = args.phone.trim();

    const triage = assessTriage({
      symptoms: args.symptoms,
      severity: args.severity,
    });

    // --- Upsert patient: prefer verified-email match, fall back to phone ---
    // Email-first preserves identity across phone-number changes; phone
    // fallback links legacy (pre-OTP) records on a returning patient's first
    // verified visit, after which we stamp the verified email on the existing
    // row rather than creating a duplicate.
    let existing = await db
      .prepare(
        "SELECT id, memory, visit_count, summary FROM patients WHERE email = ? AND email_verified_at IS NOT NULL",
      )
      .bind(verifiedEmail)
      .first<Record<string, unknown>>();
    if (!existing) {
      existing = await db
        .prepare(
          "SELECT id, memory, visit_count, summary FROM patients WHERE phone = ?",
        )
        .bind(phone)
        .first<Record<string, unknown>>();
    }

    const conditions = uniq(args.conditions);
    const allergies = uniq(args.allergies);
    const medications = uniq(args.medications);

    let patientId: string;
    const returning = !!existing;

    if (existing) {
      patientId = String(existing.id);
      // Merge structured facts (dedupe) — never invent.
      const prev = parseMemory(existing.memory);
      const mergedMemory: PatientMemory = {
        conditions: uniq(prev.conditions, conditions),
        allergies: uniq(prev.allergies, allergies),
        medications: uniq(prev.medications, medications),
        dental_history: args.lastDentalVisit ?? prev.dental_history,
        anxiety: args.anxiety ?? prev.anxiety,
        recurring_complaints: uniq(
          prev.recurring_complaints,
          args.affectedArea ? [args.affectedArea] : [],
        ),
        flags: prev.flags,
      };
      const visitCount = Number(existing.visit_count ?? 0) + 1;
      // Always stamp the verified email + phone on the existing record. This
      // both links legacy phone-only rows to the verified identity and keeps
      // the phone in sync if the patient updated it on intake.
      await db
        .prepare(
          "UPDATE patients SET name = COALESCE(?, name), email = ?, email_verified_at = ?, " +
            "phone = ?, age = COALESCE(?, age), gender = COALESCE(?, gender), memory = ?, " +
            "last_visit = ?, visit_count = ?, updated_at = ? WHERE id = ?",
        )
        .bind(
          patientName,
          verifiedEmail,
          now,
          phone,
          args.age ?? null,
          args.gender ?? null,
          JSON.stringify(mergedMemory),
          now,
          visitCount,
          now,
          patientId,
        )
        .run();
    } else {
      patientId = crypto.randomUUID();
      const memory: PatientMemory = {
        conditions,
        allergies,
        medications,
        dental_history: args.lastDentalVisit,
        anxiety: args.anxiety,
        recurring_complaints: args.affectedArea ? [args.affectedArea] : [],
        flags: [],
      };
      await db
        .prepare(
          "INSERT INTO patients (id, phone, name, age, gender, email, email_verified_at, summary, memory, " +
            "last_visit, visit_count, created_at, updated_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?, 1, ?, ?)",
        )
        .bind(
          patientId,
          phone,
          patientName,
          args.age ?? null,
          args.gender ?? null,
          verifiedEmail,
          now,
          JSON.stringify(memory),
          now,
          now,
          now,
        )
        .run();
    }

    // Bind this patient session to the resolved record (least-privilege scope).
    const sessionId =
      ctx.caller.kind === "patient" ? ctx.caller.sessionId : null;
    if (ctx.caller.kind === "patient") {
      ctx.caller.patientId = patientId;
    }

    // Link the originating conversation → patient (best-effort, never throws).
    // The session row exists for patient callers; if the UPDATE fails (e.g.
    // session not yet persisted) we still proceed with the submission.
    if (sessionId) {
      try {
        await db
          .prepare("UPDATE sessions SET patient_id = ?, updated_at = ? WHERE id = ?")
          .bind(patientId, now, sessionId)
          .run();
      } catch {
        // best-effort linkage; do not fail the patient's submission.
      }
    }

    // --- Insert intake linked to the patient (+ originating session) ---
    // Intake email reflects the VERIFIED email (the source of truth), not the
    // model-supplied args.email — keeps the intake row honest about whose
    // contact details Dr Kyana's team is acting on.
    const intakeId = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO intakes (id, patient_id, name, phone, email, age, gender, " +
          "affected_area, symptoms, duration, severity, triggers, " +
          "conditions, allergies, medications, last_dental_visit, anxiety, " +
          "preferred_area, preferred_days, time_of_day, urgency, payment, " +
          "triage_level, triage_action, status, raw_message, session_id, created_at, updated_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)",
      )
      .bind(
        intakeId,
        patientId,
        patientName,
        phone,
        verifiedEmail,
        args.age ?? null,
        args.gender ?? null,
        args.affectedArea ?? null,
        args.symptoms ? args.symptoms.join(", ") : null,
        args.duration ?? null,
        args.severity ?? null,
        args.triggers ? args.triggers.join(", ") : null,
        JSON.stringify(conditions),
        JSON.stringify(allergies),
        JSON.stringify(medications),
        args.lastDentalVisit ?? null,
        args.anxiety ?? null,
        args.preferredArea ?? null,
        args.preferredDays ?? null,
        args.timeOfDay ?? null,
        args.urgency ?? null,
        args.payment ?? null,
        triage.level,
        triage.action,
        args.rawMessage ?? null,
        sessionId,
        now,
        now,
      )
      .run();

    // --- Urgent notification (best-effort, non-blocking) ---
    // RED/ORANGE triage → email Dr Kyana so she sees it immediately. Wrapped in
    // try/catch and scheduled via waitUntil so a mail failure NEVER fails the
    // patient's submission. Requires the patient project to also bind EMAIL +
    // RECEPTIONIST_FROM/DR_KYANA_NOTIFY_EMAIL (see provisioning note).
    if (triage.level === "RED" || triage.level === "ORANGE") {
      const complaint = (args.affectedArea ?? args.rawMessage ?? "")
        .trim()
        .slice(0, 280);
      const body = [
        `Urgent intake (${triage.level}).`,
        ``,
        `Patient: ${patientName ?? "Unknown"}`,
        `Phone: ${phone}`,
        `Triage: ${triage.level} (${triage.action})`,
        `Severity: ${args.severity ?? "n/a"}/10`,
        complaint ? `Complaint: ${complaint}` : ``,
        ``,
        `Intake id: ${intakeId}`,
      ]
        .filter(Boolean)
        .join("\n");
      const notify = ctx.env.DR_KYANA_NOTIFY_EMAIL;
      ctx.waitUntil(
        (async () => {
          try {
            if (notify) {
              await sendEmail(ctx.env, {
                to: notify,
                subject: `Urgent (${triage.level}) intake — ${patientName ?? phone}`,
                body,
              });
            }
          } catch {
            // Best-effort only: swallow so the submission stays successful.
          }
        })(),
      );
    }

    return {
      ok: true,
      intakeId,
      patientId,
      triageLevel: triage.level,
      triageAction: triage.action,
      returning,
    };
  },
});
