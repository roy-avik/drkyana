/**
 * kb_search — RAG over the `drkyana-kb` Vectorize index, with citations.
 *
 * Embeds the query with Workers AI (`@cf/baai/bge-m3`, 1024-dim — matches the
 * index), runs a cosine top-K query, and returns compact citations the agent
 * can attribute drafts to. An EMPTY index (no ingestion yet) returns `[]` — that
 * is a valid, non-error state for v1.
 *
 * category 'read': no side effect, no approval gate.
 */
import { z } from "zod";
import type { DraftCitation } from "@drkyana/types";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";
import { embedQuery } from "../../embeddings";

const inputSchema = z.object({
  query: z.string().min(1).describe("Natural-language clinical/knowledge query."),
  topK: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe("How many KB chunks to retrieve (default 5)."),
});

export interface KbSearchResult {
  matches: (DraftCitation & { score: number })[];
}

export const kbSearchTool = defineTool({
  name: "kb_search",
  description:
    "Search Dr Kyana's curated dental knowledge base (RAG). Returns the most " +
    "relevant passages with citations (title + snippet) so drafts can cite " +
    "sources. Returns no matches if the KB is empty.",
  category: "read",
  inputSchema,
  async execute(args, ctx: AgentContext): Promise<KbSearchResult> {
    assertAdmin(ctx);
    const topK = args.topK ?? 5;

    let vector: number[];
    try {
      vector = await embedQuery(ctx.env, args.query);
    } catch {
      // Embeddings unavailable (e.g. AI binding not yet provisioned) — fail soft
      // so the agent can continue without RAG rather than aborting the turn.
      return { matches: [] };
    }

    const { matches } = await ctx.env.VECTORIZE.query(vector, {
      topK,
      returnMetadata: "all",
    });

    const out = (matches ?? []).map((m) => {
      const md = (m.metadata ?? {}) as Record<string, unknown>;
      return {
        kbDocId: typeof md.docId === "string" ? md.docId : m.id,
        title: typeof md.title === "string" ? md.title : "Untitled source",
        snippet: typeof md.text === "string" ? md.text.slice(0, 280) : undefined,
        score: m.score,
      };
    });

    return { matches: out };
  },
});
