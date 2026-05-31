/**
 * pubmed_fetch — pull the abstract for a specific PMID (NCBI efetch) into
 * context. Used after `pubmed_search` returns a citation Dr Kyana wants the
 * agent to actually read before grounding a differential or summary in it.
 *
 * category 'read': no side effect, no approval gate. Admin-only.
 *
 * Returns plain-text abstract (title + abstract + source line as NCBI formats
 * it), truncated to a sane length so one oversized record can't blow the
 * context window. Fails soft (empty abstract) on unreachable upstream — same
 * posture as web_fetch.
 */
import { z } from "zod";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";
import { EUTILS, pubmedUrl, withCommon } from "./pubmed_shared";

const MAX_CHARS = 6_000;

const inputSchema = z.object({
  pmid: z
    .string()
    .regex(/^\d+$/, "PMID must be digits only")
    .describe("PubMed ID (PMID) from a pubmed_search result, digits only."),
});

export interface PubMedFetchResult {
  pmid: string;
  url: string;
  abstract: string;
  truncated: boolean;
}

export const pubmedFetchTool = defineTool({
  name: "pubmed_fetch",
  description:
    "Fetch the abstract for a specific PubMed article by PMID (NCBI efetch). Use " +
    "after pubmed_search returns a citation you want to read before grounding a " +
    "draft or differential in it. Returns up to ~6000 chars of plain-text abstract. " +
    "Returns empty abstract if the article is unreachable.",
  category: "read",
  inputSchema,
  async execute(args, ctx: AgentContext): Promise<PubMedFetchResult> {
    assertAdmin(ctx);
    const env = ctx.env;
    const url = pubmedUrl(args.pmid);

    try {
      const params = withCommon(
        new URLSearchParams({
          db: "pubmed",
          id: args.pmid,
          rettype: "abstract",
          retmode: "text",
        }),
        env,
      );
      const res = await fetch(`${EUTILS}/efetch.fcgi?${params.toString()}`, {
        signal: ctx.abortSignal,
      });
      if (!res.ok) return { pmid: args.pmid, url, abstract: "", truncated: false };
      const text = (await res.text()).trim();
      const truncated = text.length > MAX_CHARS;
      return {
        pmid: args.pmid,
        url,
        abstract: truncated ? text.slice(0, MAX_CHARS) : text,
        truncated,
      };
    } catch {
      return { pmid: args.pmid, url, abstract: "", truncated: false };
    }
  },
});
