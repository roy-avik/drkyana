/**
 * web_search — Tavily-backed live web search for the admin agent. Dr Kyana
 * uses it to pull current clinical guidance, references, or regulatory notes
 * that aren't in the curated KB.
 *
 * category 'read': no side effect, no approval gate. The body never reaches
 * a patient — admin-only.
 *
 * Fails soft when `TAVILY_API_KEY` is unset or the upstream is unreachable
 * (returns `{ results: [] }` instead of throwing) so the agent can continue
 * the turn without live web access. This mirrors `kb_search`'s posture.
 */

import { z } from "zod";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";

const inputSchema = z.object({
  query: z.string().min(1).describe("Natural-language web query."),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe("How many results to return (default 5)."),
  search_depth: z
    .enum(["basic", "advanced"])
    .optional()
    .describe(
      "'basic' is cheap and fast; 'advanced' costs more but returns higher-quality results " +
        "with snippets. Default 'basic'.",
    ),
});

export interface WebSearchResult {
  results: {
    title: string;
    url: string;
    snippet: string;
    score: number;
  }[];
  /** Optional one-paragraph synthesis Tavily provides for the query. */
  answer?: string;
}

interface TavilyApiResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
}

interface TavilySearchResponse {
  results?: TavilyApiResult[];
  answer?: string;
}

export const webSearchTool = defineTool({
  name: "web_search",
  description:
    "Search the live public web (Tavily) for current clinical guidance, references, or " +
    "regulatory notes the curated knowledge base doesn't cover. Returns title + URL + " +
    "snippet for each result so you can cite specific sources. Returns no results if the " +
    "search is unconfigured.",
  category: "read",
  inputSchema,
  async execute(args, ctx: AgentContext): Promise<WebSearchResult> {
    assertAdmin(ctx);
    const apiKey = ctx.env.TAVILY_API_KEY;
    if (!apiKey) return { results: [] };

    const max_results = args.max_results ?? 5;
    const search_depth = args.search_depth ?? "basic";

    let json: TavilySearchResponse;
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query: args.query,
          max_results,
          search_depth,
          include_answer: true,
        }),
        signal: ctx.abortSignal,
      });
      if (!res.ok) return { results: [] };
      json = (await res.json()) as TavilySearchResponse;
    } catch {
      return { results: [] };
    }

    const results = (json.results ?? []).map((r) => ({
      title: r.title ?? "Untitled",
      url: r.url ?? "",
      snippet: (r.content ?? "").slice(0, 320),
      score: typeof r.score === "number" ? r.score : 0,
    }));

    return json.answer ? { results, answer: json.answer } : { results };
  },
});
