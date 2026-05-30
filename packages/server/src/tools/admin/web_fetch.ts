/**
 * web_fetch — Tavily Extract for the admin agent. Pulls the readable text of
 * a specific URL into context — used after `web_search` returns a result Dr
 * Kyana wants the agent to ground a draft in.
 *
 * category 'read': no side effect, no approval gate. Admin-only.
 *
 * Fails soft on unconfigured / unreachable upstream (returns empty content),
 * same posture as kb_search and web_search. Result is truncated to a sane
 * length so a single oversized page can't blow the context window.
 */

import { z } from "zod";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";

const MAX_CHARS = 8_000;

const inputSchema = z.object({
  url: z.string().url().describe("Fully-qualified URL of the page to extract."),
});

export interface WebFetchResult {
  url: string;
  content: string;
  truncated: boolean;
}

interface TavilyExtractResult {
  url?: string;
  raw_content?: string;
}

interface TavilyExtractResponse {
  results?: TavilyExtractResult[];
}

export const webFetchTool = defineTool({
  name: "web_fetch",
  description:
    "Fetch and extract readable text from a specific URL (Tavily Extract). Use after " +
    "web_search returns a promising result you want to ground a draft or summary in. " +
    "Returns up to ~8000 chars of cleaned page text. Returns empty content if " +
    "extraction fails or is unconfigured.",
  category: "read",
  inputSchema,
  async execute(args, ctx: AgentContext): Promise<WebFetchResult> {
    assertAdmin(ctx);
    const apiKey = ctx.env.TAVILY_API_KEY;
    if (!apiKey) return { url: args.url, content: "", truncated: false };

    let json: TavilyExtractResponse;
    try {
      const res = await fetch("https://api.tavily.com/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          urls: [args.url],
        }),
        signal: ctx.abortSignal,
      });
      if (!res.ok) return { url: args.url, content: "", truncated: false };
      json = (await res.json()) as TavilyExtractResponse;
    } catch {
      return { url: args.url, content: "", truncated: false };
    }

    const first = json.results?.[0];
    const raw = first?.raw_content ?? "";
    const truncated = raw.length > MAX_CHARS;
    return {
      url: first?.url ?? args.url,
      content: truncated ? raw.slice(0, MAX_CHARS) : raw,
      truncated,
    };
  },
});
