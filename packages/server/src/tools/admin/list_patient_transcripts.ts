/**
 * list_patient_transcripts — list a patient's past chat conversations (sessions
 * linked to the patient), newest first. READ (no approval). Returns compact
 * metadata only; use get_transcript to read a specific conversation.
 */
import { z } from "zod";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";

const inputSchema = z.object({
  patientId: z.string().min(1),
  limit: z.number().int().min(1).max(50).optional().describe("Default 20."),
});

interface TranscriptSummary {
  sessionId: string;
  created_at: number;
  updated_at: number;
  message_count: number;
  summary: string | null;
}

export const listPatientTranscriptsTool = defineTool({
  name: "list_patient_transcripts",
  description:
    "List a patient's past chat conversations (most recent first), with message " +
    "counts and any rolling summary. Use get_transcript to read one in full.",
  category: "read",
  inputSchema,
  async execute(
    args,
    ctx: AgentContext,
  ): Promise<{ transcripts: TranscriptSummary[] }> {
    assertAdmin(ctx);
    const { results } = await ctx.env.DB.prepare(
      "SELECT id, messages, summary, created_at, updated_at FROM sessions " +
        "WHERE patient_id = ? ORDER BY updated_at DESC LIMIT ?",
    )
      .bind(args.patientId, args.limit ?? 20)
      .all<Record<string, unknown>>();

    const transcripts = (results ?? []).map((r): TranscriptSummary => {
      let count = 0;
      try {
        const parsed = JSON.parse(String(r.messages ?? "[]"));
        if (Array.isArray(parsed)) count = parsed.length;
      } catch {
        /* leave 0 */
      }
      return {
        sessionId: String(r.id),
        created_at: Number(r.created_at ?? 0),
        updated_at: Number(r.updated_at ?? 0),
        message_count: count,
        summary: (r.summary as string | null) ?? null,
      };
    });
    return { transcripts };
  },
});
