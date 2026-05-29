/**
 * start_radiology_analysis — dispatch the radiology subagent as a BACKGROUND
 * job and return a jobId immediately (no streaming). The admin UI polls
 * GET /api/jobs/:id for the draft observations.
 *
 * category 'external' (it kicks off vision inference / spend); needsApproval is
 * intentionally FALSE here — it does not act on the patient or send anything; it
 * only starts an analysis whose OUTPUT is a draft Dr Kyana reviews. The
 * approval gate lives on the downstream send/finalize, not on starting the read.
 */
import { z } from "zod";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";
import { jobRunner, type RadiologyJobInput } from "../../jobs/handlers";

const inputSchema = z.object({
  imageR2Key: z.string().min(1).describe("R2 key of the uploaded dental image."),
  context: z
    .string()
    .optional()
    .describe("Optional clinical context (complaint, tooth of interest)."),
  patientId: z.string().optional().describe("Link observations to this patient."),
  intakeId: z.string().optional(),
  mediaType: z
    .string()
    .optional()
    .describe("Image media type, e.g. 'image/png' or 'image/jpeg'."),
});

export const startRadiologyAnalysisTool = defineTool({
  name: "start_radiology_analysis",
  description:
    "Start a background analysis of an uploaded dental image (X-ray/CBCT/" +
    "intraoral). Returns a jobId immediately; the result is DRAFT observations " +
    "(never a diagnosis) the UI fetches when ready. Tell the user analysis has " +
    "started.",
  category: "external",
  needsApproval: false,
  inputSchema,
  async execute(args, ctx: AgentContext): Promise<{ jobId: string }> {
    assertAdmin(ctx);
    const input: RadiologyJobInput = {
      imageR2Key: args.imageR2Key,
      context: args.context,
      patientId: args.patientId,
      intakeId: args.intakeId,
      mediaType: args.mediaType,
    };
    return jobRunner.enqueue(ctx, "radiology", input);
  },
});
