/**
 * Embeddings helper (server-only).
 *
 * Anthropic ships no embeddings API, so KB retrieval embeds text with Cloudflare
 * Workers AI. We use `@cf/baai/bge-m3` — multilingual (EN/BN/FA all map into the
 * same space) and 1024-dim, which MATCHES the `drkyana-kb` Vectorize index
 * (`--dimensions=1024 --metric=cosine`). Keep the model id and the index
 * dimensions in lockstep: changing one without re-embedding the corpus breaks
 * retrieval.
 */
import type { Env } from "./bindings";

export const EMBEDDING_MODEL = "@cf/baai/bge-m3" as const;
export const EMBEDDING_DIM = 1024;

/** Embed a single string into a 1024-dim vector via Workers AI. */
export async function embedQuery(env: Env, text: string): Promise<number[]> {
  const res = await env.AI.run(EMBEDDING_MODEL, { text });
  const vec = res?.data?.[0];
  if (!Array.isArray(vec)) {
    throw new Error("embedding failed: empty response from Workers AI");
  }
  return vec;
}

/**
 * Embed a batch of strings (KB ingestion). bge-m3 accepts a string[] and returns
 * one vector per input in `data`. We chunk into small batches so a large doc
 * doesn't exceed the model's per-call input limit. Order is preserved.
 */
export async function embedTexts(env: Env, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const BATCH = 16;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const res = await env.AI.run(EMBEDDING_MODEL, { text: slice });
    const vecs = res?.data;
    if (!Array.isArray(vecs) || vecs.length !== slice.length) {
      throw new Error("embedding failed: unexpected batch shape from Workers AI");
    }
    for (const v of vecs) {
      if (!Array.isArray(v)) {
        throw new Error("embedding failed: non-vector row in batch response");
      }
      out.push(v);
    }
  }
  return out;
}
