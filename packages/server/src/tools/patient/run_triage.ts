/**
 * run_triage — deterministic, rule-based dental triage. NO ML, NO hallucination.
 * Ported verbatim from the retired on-device `src/services/triage.ts` rules so
 * the assessment stays identical and auditable. Pure logic: the model passes
 * the structured complaint fields, the tool returns a {level, action}.
 *
 * category 'read': no side effect, no approval gate.
 */
import { z } from "zod";
import type { TriageLevel, TriageAction } from "@drkyana/types";
import { defineTool } from "../../tools";

const inputSchema = z.object({
  symptoms: z
    .array(z.string())
    .optional()
    .describe(
      "Symptom ids the patient reported, e.g. 'swelling','bleeding','broken','loose','pain'.",
    ),
  severity: z
    .number()
    .int()
    .min(0)
    .max(10)
    .optional()
    .describe("Patient-reported pain/severity on a 0–10 scale."),
  duration: z.string().optional().describe("How long it has been going on."),
  triggers: z.array(z.string()).optional().describe("What makes it worse."),
});

export interface TriageOutcome {
  level: TriageLevel;
  action: TriageAction;
  /** RED outcomes advise the patient toward the nearest hospital. */
  hospitalAdvice: boolean;
}

/**
 * Pure assessment shared by the tool and `submit_intake` (so a submission's
 * stored triage is computed by the exact same rules).
 */
export function assessTriage(complaint: {
  symptoms?: string[];
  severity?: number;
}): TriageOutcome {
  const symptoms = new Set(complaint.symptoms ?? []);
  const severity = complaint.severity ?? 0;

  // RED: combinations suggesting a dental emergency that may need hospital.
  if (
    (symptoms.has("swelling") && severity >= 8) ||
    (symptoms.has("bleeding") && severity >= 9) ||
    (symptoms.has("swelling") && symptoms.has("bleeding"))
  ) {
    return { level: "RED", action: "fast_track", hospitalAdvice: true };
  }

  // ORANGE: severe but not hospital-level.
  if (
    severity >= 8 ||
    (symptoms.has("swelling") && severity >= 5) ||
    (symptoms.has("broken") && severity >= 6)
  ) {
    return { level: "ORANGE", action: "priority", hospitalAdvice: false };
  }

  // YELLOW: moderate, needs attention within days.
  if (
    severity >= 5 ||
    symptoms.has("swelling") ||
    symptoms.has("broken") ||
    symptoms.has("bleeding") ||
    symptoms.has("loose")
  ) {
    return { level: "YELLOW", action: "normal", hospitalAdvice: false };
  }

  // GREEN: routine.
  return { level: "GREEN", action: "normal", hospitalAdvice: false };
}

export const runTriageTool = defineTool({
  name: "run_triage",
  description:
    "Assess urgency of a dental complaint with deterministic rules. " +
    "Returns a triage level (RED/ORANGE/YELLOW/GREEN) and action. " +
    "RED means advise the patient to go to the nearest hospital.",
  category: "read",
  inputSchema,
  async execute(args): Promise<TriageOutcome> {
    return assessTriage({ symptoms: args.symptoms, severity: args.severity });
  },
});
