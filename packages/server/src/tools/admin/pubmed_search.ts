/**
 * pubmed_search — peer-reviewed literature search (NCBI PubMed) for the admin
 * agent. Dr Kyana uses it to ground research and differentials in citable
 * primary sources rather than the open web alone.
 *
 * Two hops against E-utilities: `esearch` resolves the query to PMIDs, then
 * `esummary` hydrates each into a compact citation (title · journal · year ·
 * authors · canonical PubMed URL). For abstracts, the agent follows up with
 * `pubmed_fetch` on a returned PMID.
 *
 * category 'read': no side effect, no approval gate — a literature lookup is
 * safe and read-only, same posture as web_search/kb_search. Admin-only; the
 * body never reaches a patient surface.
 *
 * Fails soft on every error path (returns `{ results: [] }`) so the agent can
 * finish the turn without literature access instead of aborting.
 */
import { z } from "zod";
import { defineTool } from "../../tools";
import type { AgentContext } from "../../context";
import { assertAdmin } from "../../context";
import { EUTILS, pubmedUrl, withCommon } from "./pubmed_shared";

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "PubMed query. Plain clinical language works ('apical periodontitis " +
        "antibiotic management'); PubMed field tags are also honoured " +
        "('dental pulp necrosis[MeSH] AND review[ptyp]').",
    ),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe("How many citations to return (default 5)."),
  since_year: z
    .number()
    .int()
    .min(1900)
    .max(2100)
    .optional()
    .describe(
      "Restrict to articles published in or after this year. Use when you need " +
        "current guidance rather than historical literature.",
    ),
});

export interface PubMedCitation {
  pmid: string;
  title: string;
  journal: string;
  year: string;
  authors: string;
  url: string;
}

export interface PubMedSearchResult {
  results: PubMedCitation[];
}

interface ESearchResponse {
  esearchresult?: { idlist?: string[] };
}

interface ESummaryAuthor {
  name?: string;
  authtype?: string;
}
interface ESummaryRecord {
  uid?: string;
  title?: string;
  source?: string;
  pubdate?: string;
  authors?: ESummaryAuthor[];
}
interface ESummaryResponse {
  // Keyed by PMID, plus a `uids` array — hence the union value type.
  result?: Record<string, ESummaryRecord | string[]>;
}

/** "Smith J, Doe A, Roy B, et al." — first three names, then et al. */
function formatAuthors(authors: ESummaryAuthor[] | undefined): string {
  const names = (authors ?? [])
    .map((a) => (typeof a.name === "string" ? a.name : ""))
    .filter((n) => n.length > 0);
  if (names.length === 0) return "—";
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")}, et al.`;
}

export const pubmedSearchTool = defineTool({
  name: "pubmed_search",
  description:
    "Search PubMed (NCBI) for peer-reviewed clinical literature. Returns a compact " +
    "citation per hit — title, journal, year, authors, PMID, and a canonical " +
    "pubmed.ncbi.nlm.nih.gov URL — so you can cite primary sources by PMID in a " +
    "differential or research summary. Prefer this over web_search for clinical " +
    "evidence. Follow up with pubmed_fetch on a PMID to read its abstract. Returns " +
    "no results if PubMed is unreachable.",
  category: "read",
  inputSchema,
  async execute(args, ctx: AgentContext): Promise<PubMedSearchResult> {
    assertAdmin(ctx);
    const env = ctx.env;
    const retmax = args.max_results ?? 5;

    try {
      // --- esearch: query -> PMIDs ---
      const esp = withCommon(
        new URLSearchParams({
          db: "pubmed",
          term: args.query,
          retmode: "json",
          retmax: String(retmax),
          sort: "relevance",
        }),
        env,
      );
      if (args.since_year) {
        esp.set("datetype", "pdat");
        esp.set("mindate", String(args.since_year));
        esp.set("maxdate", "3000");
      }
      const sRes = await fetch(`${EUTILS}/esearch.fcgi?${esp.toString()}`, {
        signal: ctx.abortSignal,
      });
      if (!sRes.ok) return { results: [] };
      const sJson = (await sRes.json()) as ESearchResponse;
      const ids = sJson.esearchresult?.idlist ?? [];
      if (ids.length === 0) return { results: [] };

      // --- esummary: PMIDs -> citation metadata ---
      const usp = withCommon(
        new URLSearchParams({
          db: "pubmed",
          id: ids.join(","),
          retmode: "json",
        }),
        env,
      );
      const uRes = await fetch(`${EUTILS}/esummary.fcgi?${usp.toString()}`, {
        signal: ctx.abortSignal,
      });
      if (!uRes.ok) return { results: [] };
      const uJson = (await uRes.json()) as ESummaryResponse;
      const result = uJson.result ?? {};

      const results: PubMedCitation[] = [];
      for (const pmid of ids) {
        const rec = result[pmid];
        if (!rec || Array.isArray(rec) || typeof rec !== "object") continue;
        const pubdate = typeof rec.pubdate === "string" ? rec.pubdate : "";
        results.push({
          pmid,
          title:
            typeof rec.title === "string"
              ? rec.title.replace(/\.$/, "")
              : "(untitled)",
          journal: typeof rec.source === "string" ? rec.source : "",
          year: /^\d{4}/.test(pubdate) ? pubdate.slice(0, 4) : "",
          authors: formatAuthors(rec.authors),
          url: pubmedUrl(pmid),
        });
      }
      return { results };
    } catch {
      return { results: [] };
    }
  },
});
