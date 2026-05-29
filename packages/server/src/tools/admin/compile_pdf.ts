/**
 * compile_pdf — dispatch a markdown → PDF render as a BACKGROUND job and return
 * a jobId immediately. The handler stores the PDF in R2 and (if a draftId is
 * given) links it onto the draft row. The admin UI polls GET /api/jobs/:id.
 *
 * category 'external' (produces a stored artifact). needsApproval FALSE: it only
 * renders the already-reviewed markdown into a PDF in our own R2 — it does not
 * send the PDF anywhere. Sending is the separate, approval-gated step.
 */
import { z } from "zod";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";
import { jobRunner, type CompilePdfJobInput } from "../../jobs/handlers";

const inputSchema = z.object({
  markdown: z.string().min(1).describe("The reviewed markdown to render."),
  docType: z
    .enum(["aftercare", "clinical_note", "referral", "certificate", "prescription", "radiology"])
    .describe("Document type — labels the PDF banner."),
  draftId: z
    .string()
    .optional()
    .describe("If set, the rendered PDF's R2 key is linked back onto this draft."),
});

export const compilePdfTool = defineTool({
  name: "compile_pdf",
  description:
    "Render reviewed markdown into a PDF (stored in R2). Returns a jobId; the UI " +
    "fetches the R2 key when ready. Use after Dr Kyana has reviewed/edited the " +
    "draft markdown.",
  category: "external",
  needsApproval: false,
  inputSchema,
  async execute(args, ctx: AgentContext): Promise<{ jobId: string }> {
    assertAdmin(ctx);
    const input: CompilePdfJobInput = {
      markdown: args.markdown,
      docType: args.docType,
      draftId: args.draftId,
    };
    return jobRunner.enqueue(ctx, "compile_pdf", input);
  },
});
