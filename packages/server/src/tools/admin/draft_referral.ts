/**
 * draft_referral — a referral letter to a specialist (e.g. oral surgeon,
 * orthodontist, endodontist), drafted from an intake + patient memory.
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
  intakeId: z.string().min(1).describe("The intake the referral is for."),
  specialty: z
    .string()
    .min(1)
    .describe("Specialty to refer to, e.g. 'oral surgeon', 'orthodontist'."),
});

const SYSTEM =
  "You draft professional dental REFERRAL letters for Dr Kyana (dental surgeon, " +
  "Dhaka) addressed to a specialist colleague. Structure: addressee line, brief " +
  "reason for referral, relevant history (from intake + patient memory only — " +
  "never invented), current findings (provisional, not a definitive diagnosis), " +
  "and the specific question/assistance requested. Professional, concise tone. " +
  "Output GitHub-flavored markdown.";

export const draftReferralTool = defineTool({
  name: "draft_referral",
  description:
    "Draft a referral letter to a specialist for an intake, grounded in the " +
    "patient's history. Produces a draft for Dr Kyana to review and sign — sends " +
    "nothing.",
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
      `${args.specialty} referral ${intake.affected_area ?? ""}`.trim(),
    );

    const memoryBlock = patient
      ? `\n\nPatient memory — summary: ${patient.summary || "(none)"}; ` +
        `allergies: ${patient.memory.allergies.join(", ") || "(none)"}; ` +
        `conditions: ${patient.memory.conditions.join(", ") || "(none)"}; ` +
        `medications: ${patient.memory.medications.join(", ") || "(none)"}.`
      : "";

    const markdown = await renderDraft(ctx, {
      system: SYSTEM,
      prompt:
        `Referral to: ${args.specialty}.\n\nIntake:\n${intakeForPrompt(intake)}` +
        memoryBlock +
        `\n\nWrite the referral letter. End with this exact disclaimer in italics: "${DRAFT_DISCLAIMER}"`,
    });

    return persistDraft(ctx, {
      type: "referral",
      title: `Referral to ${args.specialty} — ${intake.name ?? intake.id}`,
      markdown,
      citations,
      patientId: intake.patient_id,
      intakeId: intake.id,
    });
  },
});
