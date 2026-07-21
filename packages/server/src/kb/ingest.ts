/**
 * Knowledge-base ingestion (server-only). HUMAN-CURATED: nothing auto-ingests —
 * Dr Kyana pastes/titles a reference in the admin KB page and this runs.
 *
 * Flow (must produce vectors that `kb_search` can find):
 *   1. chunk the text into overlapping windows,
 *   2. embed each chunk with Workers AI `@cf/baai/bge-m3` (1024-dim, matches the
 *      `drkyana-kb` Vectorize index) via `embedTexts`,
 *   3. VECTORIZE.upsert each chunk with metadata { docId, title, chunkIndex, text,
 *      lang?, tags? } — `kb_search` reads `docId`/`title`/`text` off this metadata
 *      to build citations, so those keys are the compatibility contract,
 *   4. register/update the doc in D1 `kb_docs` (provenance + chunk_count + curated).
 *
 * Vector ids are deterministic (`${docId}:${chunkIndex}`) so re-ingesting a doc
 * with the same id overwrites its chunks. Delete removes both the vectors and the
 * kb_docs row.
 *
 * Vectorize metadata limits: total metadata per vector is capped (~10 KiB), so we
 * truncate the stored `text` snippet and keep tags compact.
 */
import type { Env } from "../bindings";
import { embedTexts } from "../embeddings";

/** Max characters of chunk text mirrored into vector metadata (snippet source). */
const META_TEXT_LIMIT = 1000;
const DEFAULT_CHUNK_CHARS = 900;
const DEFAULT_OVERLAP_CHARS = 150;

export interface IngestDocInput {
  /** Stable id. Omit to mint a new one; pass an existing id to re-ingest/replace. */
  id?: string;
  title: string;
  /** Provenance (URL, book, "Dr Kyana", etc.). Optional. */
  source?: string | null;
  /** The reference body to chunk + embed. */
  text: string;
  /** Vectorize namespace; defaults to "default" (kb_search queries the index-wide top-K). */
  namespace?: string;
  /** Language hint stored in metadata (e.g. "en" | "bn" | "fa"). */
  lang?: string;
  /** Free-form tags stored in metadata + handy for the curation UI. */
  tags?: string[];
}

export interface IngestResult {
  id: string;
  title: string;
  chunkCount: number;
}

/**
 * Split text into overlapping character windows. We prefer to break on paragraph
 * / sentence boundaries near the target size so chunks stay coherent, then carry
 * a small overlap so a fact split across a boundary is still retrievable.
 */
export function chunkText(
  text: string,
  chunkChars = DEFAULT_CHUNK_CHARS,
  overlapChars = DEFAULT_OVERLAP_CHARS,
): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= chunkChars) return [clean];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + chunkChars, clean.length);
    if (end < clean.length) {
      // Try to end on a paragraph, then sentence, then whitespace boundary that
      // falls within the back half of the window — avoids cutting mid-word.
      const window = clean.slice(start, end);
      const minBreak = Math.floor(chunkChars * 0.5);
      const breakAt = (() => {
        const para = window.lastIndexOf("\n\n");
        if (para >= minBreak) return para + 2;
        const sentence = Math.max(
          window.lastIndexOf(". "),
          window.lastIndexOf("। "), // Bengali danda
          window.lastIndexOf("? "),
          window.lastIndexOf("! "),
        );
        if (sentence >= minBreak) return sentence + 2;
        const space = window.lastIndexOf(" ");
        if (space >= minBreak) return space + 1;
        return -1;
      })();
      if (breakAt > 0) end = start + breakAt;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;

    // Rewind by the overlap, then snap FORWARD to the next word boundary. The
    // rewind is a raw character count, so without this every chunk after the
    // first began mid-word ("...pha alpha alpha"). That fragment is noise in
    // the embedding and, worse, shows up verbatim in the `text` metadata that
    // kb_search returns as a citation snippet to the clinician.
    // Only snaps within the overlap region (which is duplicated content by
    // definition), so no unique text can be skipped. If there is no boundary to
    // snap to — one unbroken token — the raw offset stands.
    let next = Math.max(end - overlapChars, start + 1);
    if (next > 0 && !/\s/.test(clean[next - 1]!)) {
      const space = clean.indexOf(" ", next);
      if (space > 0 && space < end) next = space + 1;
    }
    start = next;
  }
  return chunks;
}

function newDocId(): string {
  return `kb_${crypto.randomUUID()}`;
}

/**
 * Ingest one curated document: chunk → embed → upsert vectors → register in D1.
 * Re-ingesting with an existing id replaces that doc's chunks and updates the row.
 */
export async function ingestDoc(env: Env, input: IngestDocInput): Promise<IngestResult> {
  const id = input.id?.trim() || newDocId();
  const title = input.title.trim();
  if (!title) throw new Error("kb ingest: title is required");
  const namespace = input.namespace?.trim() || "default";

  const chunks = chunkText(input.text);
  if (chunks.length === 0) throw new Error("kb ingest: no text to ingest");

  // If re-ingesting, drop the old vectors first so a shorter doc doesn't leave
  // orphaned chunks behind.
  if (input.id) {
    await deleteVectorsForDoc(env, id, chunks.length, namespace);
  }

  const vectors = await embedTexts(env, chunks);

  const tags = (input.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 16);
  const records = chunks.map((chunk, i) => ({
    id: `${id}:${i}`,
    values: vectors[i],
    namespace,
    metadata: {
      docId: id,
      title,
      chunkIndex: i,
      // Snippet mirrored for kb_search citations; truncated to respect metadata limits.
      text: chunk.slice(0, META_TEXT_LIMIT),
      ...(input.lang ? { lang: input.lang } : {}),
      ...(tags.length ? { tags } : {}),
    } as Record<string, unknown>,
  }));

  await env.VECTORIZE.upsert(records);

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT INTO kb_docs (id, title, source, namespace, chunk_count, curated, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, 1, ?, ?) " +
      "ON CONFLICT(id) DO UPDATE SET title = excluded.title, source = excluded.source, " +
      "namespace = excluded.namespace, chunk_count = excluded.chunk_count, " +
      "curated = 1, updated_at = excluded.updated_at",
  )
    .bind(id, title, input.source ?? null, namespace, chunks.length, now, now)
    .run();

  return { id, title, chunkCount: chunks.length };
}

/** Remove every vector belonging to a doc (ids are `${docId}:${index}`). */
async function deleteVectorsForDoc(
  env: Env,
  docId: string,
  chunkCount: number,
  _namespace: string,
): Promise<void> {
  if (chunkCount <= 0) return;
  const ids = Array.from({ length: chunkCount }, (_, i) => `${docId}:${i}`);
  // Vectorize exposes deleteByIds at runtime; the minimal binding interface in
  // bindings.ts doesn't declare it, so call through a structural cast.
  const vz = env.VECTORIZE as unknown as {
    deleteByIds?: (ids: string[]) => Promise<unknown>;
  };
  if (typeof vz.deleteByIds === "function") {
    await vz.deleteByIds(ids);
  }
}

/**
 * Delete a curated doc: remove its vectors from Vectorize and its kb_docs row.
 * Idempotent — deleting an unknown id is a no-op (returns false).
 */
export async function deleteDoc(env: Env, id: string): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT chunk_count, namespace FROM kb_docs WHERE id = ?",
  )
    .bind(id)
    .first<{ chunk_count: number; namespace: string }>();
  if (!row) return false;

  await deleteVectorsForDoc(env, id, Number(row.chunk_count ?? 0), row.namespace ?? "default");
  await env.DB.prepare("DELETE FROM kb_docs WHERE id = ?").bind(id).run();
  return true;
}
