/**
 * draft_aftercare — 6th-grade post-treatment instructions in the patient's
 * language (Bengali / English / Farsi). Grounded by the KB when available.
 *
 * category 'read': produces TEXT only (persists a draft for review). No gate —
 * sending is a separate approval-gated action.
 */
import { z } from "zod";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";
import {
  DRAFT_DISCLAIMER,
  gatherCitations,
  langLabel,
  persistDraft,
  renderDraft,
  type PersistedDraft,
} from "./draft_common";

const inputSchema = z.object({
  condition: z
    .string()
    .min(1)
    .describe("The procedure or condition, e.g. 'tooth extraction', 'root canal'."),
  lang: z
    .enum(["en", "bn", "fa"])
    .describe("Patient's language for the instructions."),
  patientId: z.string().optional(),
  intakeId: z.string().optional(),
});

const SYSTEM =
  "You write dental AFTERCARE instructions for patients of Dr Kyana, a dental " +
  "surgeon in Dhaka. Write at a 6th-grade reading level: short sentences, plain " +
  "words, no jargon. Use a friendly, reassuring tone. Structure: a one-line " +
  "title, then bullet sections for 'Right after', 'First 24 hours', 'Eating', " +
  "'Pain & swelling', and 'Call us if'. Use ONLY widely-accepted standard " +
  "dental aftercare guidance; if KB sources are provided, prefer them. Never " +
  "invent drug names or dosages — say 'take the medicine Dr Kyana prescribed'. " +
  "Output GitHub-flavored markdown only.";

export const draftAftercareTool = defineTool({
  name: "draft_aftercare",
  description:
    "Draft 6th-grade post-treatment aftercare instructions for a condition or " +
    "procedure, in the patient's language (English/Bengali/Farsi). Produces a " +
    "draft for Dr Kyana to review — it does not send anything.",
  category: "read",
  inputSchema,
  async execute(args, ctx: AgentContext): Promise<PersistedDraft> {
    assertAdmin(ctx);
    const citations = await gatherCitations(
      ctx,
      `aftercare instructions for ${args.condition}`,
    );
    const kbBlock = citations.length
      ? "\n\nKB sources (prefer these):\n" +
        citations.map((c) => `- ${c.title}: ${c.snippet ?? ""}`).join("\n")
      : "";

    const markdown = await renderDraft(ctx, {
      system: SYSTEM,
      prompt:
        `Write aftercare instructions for: ${args.condition}.\n` +
        `Language: ${langLabel(args.lang)}.${kbBlock}\n\n` +
        `End the document with this exact disclaimer line in italics: "${DRAFT_DISCLAIMER}"`,
    });

    return persistDraft(ctx, {
      type: "aftercare",
      title: `Aftercare — ${args.condition}`,
      markdown,
      citations,
      patientId: args.patientId,
      intakeId: args.intakeId,
    });
  },
});
