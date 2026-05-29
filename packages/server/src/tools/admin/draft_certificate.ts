/**
 * draft_certificate — a dental/medical certificate (e.g. for leave/absence,
 * fitness) for a given purpose and date range, drafted from an intake.
 *
 * category 'read': produces TEXT only (persists a draft for review).
 */
import { z } from "zod";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";
import { fetchIntake } from "./shared";
import {
  DRAFT_DISCLAIMER,
  intakeForPrompt,
  persistDraft,
  renderDraft,
  type PersistedDraft,
} from "./draft_common";

const inputSchema = z.object({
  intakeId: z.string().min(1).describe("The intake the certificate is for."),
  purpose: z
    .string()
    .min(1)
    .describe("Purpose, e.g. 'medical leave from work', 'fitness to travel'."),
  dates: z
    .string()
    .optional()
    .describe("Date or range the certificate covers, e.g. '2026-06-01 to 2026-06-03'."),
});

const SYSTEM =
  "You draft formal dental CERTIFICATES for Dr Kyana (dental surgeon, Dhaka). " +
  "Structure: a clear title, patient name, the certified statement for the " +
  "stated purpose and dates, and a signature block for Dr Kyana. Use only the " +
  "facts supplied — never fabricate diagnoses, dates, or details. Keep it to a " +
  "single concise page. Output GitHub-flavored markdown.";

export const draftCertificateTool = defineTool({
  name: "draft_certificate",
  description:
    "Draft a dental certificate (e.g. medical leave, fitness) for a stated " +
    "purpose and date range, from an intake. Produces a draft for Dr Kyana to " +
    "review and sign — sends nothing.",
  category: "read",
  inputSchema,
  async execute(args, ctx: AgentContext): Promise<PersistedDraft | { error: string }> {
    assertAdmin(ctx);
    const intake = await fetchIntake(ctx.env, args.intakeId);
    if (!intake) return { error: `intake not found: ${args.intakeId}` };

    const markdown = await renderDraft(ctx, {
      system: SYSTEM,
      prompt:
        `Certificate purpose: ${args.purpose}.\n` +
        `Dates covered: ${args.dates ?? "(to be filled by Dr Kyana)"}.\n\n` +
        `Patient/intake:\n${intakeForPrompt(intake)}\n\n` +
        `Write the certificate. End with this exact disclaimer in italics: "${DRAFT_DISCLAIMER}"`,
    });

    return persistDraft(ctx, {
      type: "certificate",
      title: `Certificate — ${args.purpose} — ${intake.name ?? intake.id}`,
      markdown,
      citations: [],
      patientId: intake.patient_id,
      intakeId: intake.id,
    });
  },
});
