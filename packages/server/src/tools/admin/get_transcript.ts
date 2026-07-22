/**
 * get_transcript — read one conversation (session) in full as role/text turns.
 * READ (no approval). Renders UIMessage parts down to plain text to keep the
 * result compact for the model. category 'read'.
 */
import { z } from "zod";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";

const inputSchema = z.object({ sessionId: z.string().min(1) });

interface Turn {
  role: string;
  text: string;
}

/** Extract concatenated text from a UIMessage's `parts` (or legacy content). */
function turnText(m: Record<string, unknown>): string {
  const parts = m.parts;
  if (Array.isArray(parts)) {
    return parts
      .filter(
        (p): p is { type: string; text: string } =>
          !!p && (p as { type?: string }).type === "text" &&
          typeof (p as { text?: unknown }).text === "string",
      )
      .map((p) => p.text)
      .join("");
  }
  if (typeof m.content === "string") return m.content;
  return "";
}

export const getTranscriptTool = defineTool({
  name: "get_transcript",
  description:
    "Read one chat conversation (by session id) as a list of role/text turns. " +
    "Use after list_patient_transcripts to review what a patient said.",
  category: "read",
  phiRead: true,
  inputSchema,
  async execute(
    args,
    ctx: AgentContext,
  ): Promise<
    | { sessionId: string; created_at: number; turns: Turn[] }
    | { error: string }
  > {
    assertAdmin(ctx);
    const row = await ctx.env.DB.prepare(
      "SELECT id, messages, created_at FROM sessions WHERE id = ?",
    )
      .bind(args.sessionId)
      .first<Record<string, unknown>>();
    if (!row) return { error: `session not found: ${args.sessionId}` };

    let turns: Turn[] = [];
    try {
      const parsed = JSON.parse(String(row.messages ?? "[]"));
      if (Array.isArray(parsed)) {
        turns = parsed
          .map((m): Turn => ({
            role: String((m as { role?: unknown }).role ?? "unknown"),
            text: turnText(m as Record<string, unknown>),
          }))
          .filter((t) => t.text !== "");
      }
    } catch {
      /* leave empty */
    }
    return {
      sessionId: String(row.id),
      created_at: Number(row.created_at ?? 0),
      turns,
    };
  },
});
