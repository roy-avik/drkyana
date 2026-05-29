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
  // identity
  name: z.string().optional(),
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
    "Submit the collected intake to Dr Kyana. Upserts the patient by phone, " +
    "records the visit, and runs triage. Call this ONLY after collecting at " +
    "least the patient's phone and a description of their complaint, and after " +
    "the patient has agreed to share their information.",
  category: "write",
  needsApproval: false, // the patient is submitting their own intake — no gate.
  inputSchema,
  async execute(args, ctx: AgentContext): Promise<SubmitIntakeResult> {
    const db = ctx.env.DB;
    const now = Math.floor(Date.now() / 1000);
    const phone = args.phone.trim();

    const triage = assessTriage({
      symptoms: args.symptoms,
      severity: args.severity,
    });

    // --- Upsert patient (match by unique phone) ---
    const existing = await db
      .prepare(
        "SELECT id, memory, visit_count, summary FROM patients WHERE phone = ?",
      )
      .bind(phone)
      .first<Record<string, unknown>>();

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
      await db
        .prepare(
          "UPDATE patients SET name = COALESCE(?, name), email = COALESCE(?, email), " +
            "age = COALESCE(?, age), gender = COALESCE(?, gender), memory = ?, " +
            "last_visit = ?, visit_count = ?, updated_at = ? WHERE id = ?",
        )
        .bind(
          args.name ?? null,
          args.email ?? null,
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
          "INSERT INTO patients (id, phone, name, age, gender, email, summary, memory, " +
            "last_visit, visit_count, created_at, updated_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, 1, ?, ?)",
        )
        .bind(
          patientId,
          phone,
          args.name ?? null,
          args.age ?? null,
          args.gender ?? null,
          args.email ?? null,
          JSON.stringify(memory),
          now,
          now,
          now,
        )
        .run();
    }

    // Bind this patient session to the resolved record (least-privilege scope).
    if (ctx.caller.kind === "patient") {
      ctx.caller.patientId = patientId;
    }

    // --- Insert intake linked to the patient ---
    const intakeId = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO intakes (id, patient_id, name, phone, email, age, gender, " +
          "affected_area, symptoms, duration, severity, triggers, " +
          "conditions, allergies, medications, last_dental_visit, anxiety, " +
          "preferred_area, preferred_days, time_of_day, urgency, payment, " +
          "triage_level, triage_action, status, raw_message, created_at, updated_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)",
      )
      .bind(
        intakeId,
        patientId,
        args.name ?? null,
        phone,
        args.email ?? null,
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
        `Patient: ${args.name ?? "Unknown"}`,
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
                subject: `Urgent (${triage.level}) intake — ${args.name ?? phone}`,
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
