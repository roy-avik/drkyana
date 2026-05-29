/**
 * get_patient_memory — read a patient's longitudinal record: the narrative
 * `summary` plus STRUCTURED `memory` (conditions/allergies/medications/etc.) for
 * continuity across visits. Reads of patient memory should be access-logged in a
 * later phase (see docs "Security & compliance").
 *
 * category 'read'.
 */
import { z } from "zod";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";
import { fetchPatientMemory, type PatientMemoryView } from "./shared";

const inputSchema = z.object({
  patientId: z.string().min(1).describe("The patient id (not the intake id)."),
});

export const getPatientMemoryTool = defineTool({
  name: "get_patient_memory",
  description:
    "Read a patient's longitudinal record — narrative summary plus structured " +
    "memory (conditions, allergies, medications, recurring complaints, flags). " +
    "Use it for continuity when drafting clinical documents.",
  category: "read",
  inputSchema,
  async execute(
    args,
    ctx: AgentContext,
  ): Promise<{ patient: PatientMemoryView } | { patient: null }> {
    assertAdmin(ctx);
    const patient = await fetchPatientMemory(ctx.env, args.patientId);
    return { patient };
  },
});
