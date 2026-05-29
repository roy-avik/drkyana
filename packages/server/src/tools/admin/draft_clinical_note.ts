/**
 * draft_clinical_note — SOAP-style dental note from a D1 intake, informed by the
 * patient's longitudinal memory (continuity). Decision support only — it never
 * asserts a definitive diagnosis; the Assessment is framed as provisional and
 * Dr Kyana confirms it.
 *
 * category 'read': produces TEXT only (persists a draft for review).
 */
import { z } from "zod";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";
import { fetchIntake, fetchPatientMemory } from "./shared";
import {
  DRAFT_DISCLAIMER,
  gatherCitations,
  intakeForPrompt,
  persistDraft,
  renderDraft,
  type PersistedDraft,
} from "./draft_common";

const inputSchema = z.object({
  intakeId: z.string().min(1).describe("The intake to write the note from."),
});

const SYSTEM =
  "You draft SOAP-style dental clinical notes for Dr Kyana (dental surgeon, " +
  "Dhaka) as DECISION SUPPORT. Use the four SOAP sections (Subjective, " +
  "Objective, Assessment, Plan). Base every statement on the supplied intake " +
  "and patient memory — do NOT invent findings, measurements, or history. The " +
  "Assessment must be PROVISIONAL ('possible', 'consistent with', 'to be " +
  "confirmed by Dr Kyana') — never a definitive diagnosis. Note relevant " +
  "history (allergies, conditions, recurring complaints) for continuity. Output " +
  "concise GitHub-flavored markdown.";

export const draftClinicalNoteTool = defineTool({
  name: "draft_clinical_note",
  description:
    "Draft a SOAP-style dental clinical note from an intake, using the patient's " +
    "longitudinal memory for continuity. Provisional assessment only — Dr Kyana " +
    "confirms. Produces a draft for review; sends nothing.",
  category: "read",
  inputSchema,
  async execute(args, ctx: AgentContext): Promise<PersistedDraft | { error: string }> {
    assertAdmin(ctx);
    const intake = await fetchIntake(ctx.env, args.intakeId);
    if (!intake) return { error: `intake not found: ${args.intakeId}` };

    const patient = intake.patient_id
      ? await fetchPatientMemory(ctx.env, intake.patient_id)
      : null;

    const citations = await gatherCitations(
      ctx,
      `${intake.affected_area ?? ""} ${intake.symptoms ?? ""} dental assessment`.trim() ||
        "dental clinical assessment",
    );

    const memoryBlock = patient
      ? `\n\nPatient longitudinal memory:\nSummary: ${patient.summary || "(none)"}\n` +
        `Conditions: ${patient.memory.conditions.join(", ") || "(none)"}\n` +
        `Allergies: ${patient.memory.allergies.join(", ") || "(none)"}\n` +
        `Medications: ${patient.memory.medications.join(", ") || "(none)"}\n` +
        `Recurring complaints: ${patient.memory.recurring_complaints.join(", ") || "(none)"}\n` +
        `Visit count: ${patient.visitCount}`
      : "\n\n(No linked longitudinal record.)";

    const kbBlock = citations.length
      ? "\n\nKB references:\n" +
        citations.map((c) => `- ${c.title}: ${c.snippet ?? ""}`).join("\n")
      : "";

    const markdown = await renderDraft(ctx, {
      system: SYSTEM,
      prompt:
        `Intake (this visit):\n${intakeForPrompt(intake)}` +
        memoryBlock +
        kbBlock +
        `\n\nWrite the SOAP note. End with this exact disclaimer in italics: "${DRAFT_DISCLAIMER}"`,
    });

    return persistDraft(ctx, {
      type: "clinical_note",
      title: `Clinical note — ${intake.name ?? intake.id}`,
      markdown,
      citations,
      patientId: intake.patient_id,
      intakeId: intake.id,
    });
  },
});
