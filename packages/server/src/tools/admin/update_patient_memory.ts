/**
 * update_patient_memory — merge STRUCTURED facts into a patient's longitudinal
 * record and (re)compose the narrative `summary`.
 *
 * CRITICAL clinical-safety rule:
 *  - Structured facts (conditions / allergies / medications / recurring
 *    complaints / flags) are MERGED DETERMINISTICALLY here — union + dedupe with
 *    the existing memory. The model NEVER invents clinical facts; it can only
 *    pass facts that came from a structured intake / Dr Kyana.
 *  - The LLM is used ONLY to (re)compose the human-readable `summary` narrative
 *    from the already-merged structured facts — it does not assert new facts.
 *
 * WRITE: needsApproval (default) — it is Dr Kyana's medical record; she approves
 * the merge + regenerated summary before it persists.
 *
 * category 'write'.
 */
import { z } from "zod";
import { generateText } from "ai";
import type { PatientMemory } from "@drkyana/types";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";
import { modelFor } from "../../models";
import { fetchPatientMemory, mergeFacts } from "./shared";

const inputSchema = z.object({
  patientId: z.string().min(1),
  facts: z
    .object({
      conditions: z.array(z.string()).optional(),
      allergies: z.array(z.string()).optional(),
      medications: z.array(z.string()).optional(),
      recurring_complaints: z.array(z.string()).optional(),
      flags: z.array(z.string()).optional(),
      dental_history: z.string().optional(),
      anxiety: z.string().optional(),
    })
    .describe(
      "STRUCTURED facts to merge — sourced from a structured intake or Dr Kyana, " +
        "never invented. They are union-merged with existing memory.",
    ),
  regenerateSummary: z
    .boolean()
    .optional()
    .describe("If true (default), recompose the narrative summary from merged facts."),
});

const SUMMARY_SYSTEM =
  "You compose a concise clinical CONTINUITY SUMMARY for a dental patient, for " +
  "Dr Kyana's eyes. You are given the patient's MERGED STRUCTURED FACTS only. " +
  "Write 2-4 plain sentences that restate ONLY those facts (allergies, " +
  "conditions, medications, recurring complaints, anxiety, flags) for quick " +
  "continuity. Do NOT add, infer, or diagnose anything not in the facts. No " +
  "markdown, just sentences.";

export const updatePatientMemoryTool = defineTool({
  name: "update_patient_memory",
  description:
    "Merge structured clinical facts (allergies, conditions, medications, etc.) " +
    "into a patient's longitudinal memory and regenerate the narrative summary. " +
    "Structured facts are merged deterministically and never invented. Requires " +
    "Dr Kyana's approval.",
  category: "write",
  inputSchema,
  async execute(
    args,
    ctx: AgentContext,
  ): Promise<{ ok: true; patientId: string; memory: PatientMemory; summary: string } | { error: string }> {
    assertAdmin(ctx);
    const current = await fetchPatientMemory(ctx.env, args.patientId);
    if (!current) return { error: `patient not found: ${args.patientId}` };

    // --- Deterministic structured merge (union + dedupe). Never LLM. ---
    const merged: PatientMemory = {
      conditions: mergeFacts(current.memory.conditions, args.facts.conditions),
      allergies: mergeFacts(current.memory.allergies, args.facts.allergies),
      medications: mergeFacts(current.memory.medications, args.facts.medications),
      recurring_complaints: mergeFacts(
        current.memory.recurring_complaints,
        args.facts.recurring_complaints,
      ),
      flags: mergeFacts(current.memory.flags, args.facts.flags),
      dental_history: args.facts.dental_history ?? current.memory.dental_history,
      anxiety: args.facts.anxiety ?? current.memory.anxiety,
    };

    // --- LLM (re)composes the narrative summary from the MERGED facts only. ---
    let summary = current.summary;
    if (args.regenerateSummary !== false) {
      const factsBlock =
        `Allergies: ${merged.allergies.join(", ") || "none"}\n` +
        `Conditions: ${merged.conditions.join(", ") || "none"}\n` +
        `Medications: ${merged.medications.join(", ") || "none"}\n` +
        `Recurring complaints: ${merged.recurring_complaints.join(", ") || "none"}\n` +
        `Dental history: ${merged.dental_history ?? "none"}\n` +
        `Anxiety: ${merged.anxiety ?? "none"}\n` +
        `Flags: ${merged.flags.join(", ") || "none"}`;
      const { text } = await generateText({
        model: modelFor(ctx.env, "standard"),
        system: SUMMARY_SYSTEM,
        prompt: `Merged structured facts:\n${factsBlock}\n\nWrite the continuity summary.`,
        abortSignal: ctx.abortSignal,
      });
      summary = text.trim();
    }

    const now = Math.floor(Date.now() / 1000);
    await ctx.env.DB.prepare(
      "UPDATE patients SET memory = ?, summary = ?, updated_at = ? WHERE id = ?",
    )
      .bind(JSON.stringify(merged), summary, now, args.patientId)
      .run();

    return { ok: true, patientId: args.patientId, memory: merged, summary };
  },
});
