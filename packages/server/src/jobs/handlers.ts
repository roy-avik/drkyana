/**
 * Background job handlers + the shared JobRunner instance.
 *
 *  - `radiology`: reads the image from R2, runs the radiology subagent (vision
 *    read → kb_search → synthesize) via `runAgent` (NOT streamed), returns draft
 *    markdown + citations. Also persists a `drafts` row (type 'radiology').
 *  - `compile_pdf`: renders markdown → PDF (pure-JS pdf-lib), stores it in R2,
 *    links it back onto the draft row if a draftId is given. Returns the R2 key.
 *
 * The runner writes job:{id} to KV via ctx.waitUntil; the admin UI polls
 * GET /api/jobs/:id.
 */
import type {
  RadiologyResult,
  CompilePdfResult,
  DraftCitation,
  DraftType,
} from "@drkyana/types";
import { createJobRunner, type JobRunner } from "../jobs";
import type { AgentContext } from "../context";
import { runAgent } from "../agents";
import { radiologyAgentSpec } from "../agents/radiology";
import { renderMarkdownToPdf } from "../pdf/render";
import { gatherCitations } from "../tools/admin/draft_common";

export interface RadiologyJobInput {
  imageR2Key: string;
  context?: string;
  patientId?: string;
  intakeId?: string;
  mediaType?: string; // e.g. "image/png", "image/jpeg"
}

export interface CompilePdfJobInput {
  markdown: string;
  docType: DraftType | string;
  draftId?: string;
}

/** Read raw bytes for an R2 object as a Uint8Array, or throw if missing. */
async function readR2Bytes(ctx: AgentContext, key: string): Promise<Uint8Array> {
  const obj = await ctx.env.R2.get(key);
  if (!obj) throw new Error(`image not found in R2: ${key}`);
  return new Uint8Array(await obj.arrayBuffer());
}

async function handleRadiology(
  ctx: AgentContext,
  rawInput: unknown,
): Promise<RadiologyResult> {
  const input = rawInput as RadiologyJobInput;
  const bytes = await readR2Bytes(ctx, input.imageR2Key);
  const mediaType = input.mediaType ?? "image/png";

  // Build a multimodal user message: the image part + a text framing part.
  const history = [
    {
      role: "user" as const,
      content: [
        {
          type: "text" as const,
          text:
            "Read this dental image and compile DRAFT observations (not a diagnosis)." +
            (input.context ? `\n\nClinical context from Dr Kyana: ${input.context}` : "") +
            (input.patientId ? `\n\nPatient id for memory lookup: ${input.patientId}` : ""),
        },
        { type: "image" as const, image: bytes, mediaType },
      ],
    },
  ];

  const { text } = await runAgent(radiologyAgentSpec, ctx, history);

  // Best-effort citations for the draft record (the subagent may have cited too).
  const citations: DraftCitation[] = await gatherCitations(
    ctx,
    input.context ?? "dental radiograph findings",
    3,
  );

  // Persist a radiology draft for the review surface.
  const draftId = `dr_${crypto.randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);
  await ctx.env.DB.prepare(
    "INSERT INTO drafts (id, type, patient_id, intake_id, title, markdown, citations, status, created_at, updated_at) " +
      "VALUES (?, 'radiology', ?, ?, ?, ?, ?, 'draft', ?, ?)",
  )
    .bind(
      draftId,
      input.patientId ?? null,
      input.intakeId ?? null,
      "Radiology draft observations",
      text,
      JSON.stringify(citations),
      now,
      now,
    )
    .run();

  return { draftMarkdown: text, citations, imageR2Key: input.imageR2Key };
}

async function handleCompilePdf(
  ctx: AgentContext,
  rawInput: unknown,
): Promise<CompilePdfResult> {
  const input = rawInput as CompilePdfJobInput;
  const { bytes } = await renderMarkdownToPdf(input.markdown, input.docType);
  const pdfR2Key = `pdf/${input.draftId ?? crypto.randomUUID()}.pdf`;

  await ctx.env.R2.put(pdfR2Key, bytes.buffer as ArrayBuffer, {
    httpMetadata: { contentType: "application/pdf" },
  });

  if (input.draftId) {
    await ctx.env.DB.prepare(
      "UPDATE drafts SET pdf_r2_key = ?, updated_at = ? WHERE id = ?",
    )
      .bind(pdfR2Key, Math.floor(Date.now() / 1000), input.draftId)
      .run();
  }

  return { pdfR2Key, draftId: input.draftId ?? "" };
}

/** Shared runner — wired with both job kinds. Used by the dispatch tools. */
export const jobRunner: JobRunner = createJobRunner({
  radiology: handleRadiology,
  compile_pdf: handleCompilePdf,
});
