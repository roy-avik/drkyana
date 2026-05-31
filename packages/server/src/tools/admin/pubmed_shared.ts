/**
 * Shared helpers for the NCBI E-utilities (PubMed) tools — `pubmed_search`
 * and `pubmed_fetch`. These give the admin agent peer-reviewed literature it
 * can cite by PMID in research summaries and differentials.
 *
 * No API key is REQUIRED: NCBI allows anonymous access at ~3 req/s per IP,
 * which is ample for this low-volume admin surface. Setting the optional
 * `NCBI_API_KEY` secret raises the limit to ~10 req/s. We always send the
 * `tool` + `email` identifiers NCBI asks integrators to include.
 */
import type { Env } from "../../bindings";

export const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

/** Canonical public PubMed URL for a PMID — what Dr Kyana clicks to read/cite. */
export function pubmedUrl(pmid: string): string {
  return `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
}

/** Append the identifiers + optional API key NCBI expects on every call. */
export function withCommon(params: URLSearchParams, env: Env): URLSearchParams {
  params.set("tool", "drkyana-admin");
  // NCBI asks integrators for a contact email; the clinic mailbox is the
  // right identity and is always set.
  if (env.RECEPTIONIST_FROM) params.set("email", env.RECEPTIONIST_FROM);
  if (env.NCBI_API_KEY) params.set("api_key", env.NCBI_API_KEY);
  return params;
}
