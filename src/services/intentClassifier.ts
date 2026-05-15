// Tiny on-device intent classifier built on Transformers.js + multilingual
// MiniLM. The model + the transformers.js library + the ~9 MB ONNX Runtime
// Web WASM are all fetched lazily the first time the patient sends a
// message, then cached by the browser's Cache Storage API (via the
// env.useBrowserCache flag set below) so they survive across reloads even
// under cache pressure. The dynamic `import()` below keeps all of this
// out of the marketing-site bundle — the homepage pays nothing until
// someone interacts with the receptionist.
//
// We embed the patient's message and every canonical example phrase from
// intents.ts into the same vector space, then pick the intent whose
// centroid (mean of its example embeddings) is closest by cosine similarity.
// If no intent clears OTHER_THRESHOLD we fall back to 'other' and forward
// the raw message to Dr Kyana verbatim.

import { INTENTS, type Intent, type IntentId } from './intents';

const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const OTHER_THRESHOLD = 0.42; // empirical floor; below this we route to 'other'

export type ClassifyResult = {
  intent: IntentId;
  confidence: number;
  top: Array<{ intent: IntentId; score: number }>;
};

export type LoadProgress = { status: string; file?: string; progress?: number };

// Loosely-typed runtime handle — keeps this module's exports stable even
// though transformers.js types only resolve after the dynamic import.
type EmbedFn = (text: string) => Promise<Float32Array>;

type Centroid = { intent: Intent; vector: Float32Array };

let bootstrap: Promise<{ embed: EmbedFn; centroids: Centroid[] }> | null = null;

export function loadClassifier(onProgress?: (p: LoadProgress) => void): Promise<void> {
  if (!bootstrap) {
    bootstrap = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      // Load the ONNX Runtime WASM binaries from the jsDelivr CDN instead of
      // bundling them through Vite (the asyncify variant alone is ~23 MB and
      // would blow past GH Pages' practical hosting budget). The model
      // weights themselves still come from the HuggingFace CDN.
      if (env.backends.onnx.wasm) {
        env.backends.onnx.wasm.wasmPaths =
          'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/dist/';
      }
      env.allowLocalModels = false;
      // Persist the model shards in Cache Storage so a returning patient
      // doesn't re-download ~120 MB. Defaults to true on current versions
      // of @huggingface/transformers — pinned explicitly so a future
      // default flip can't silently turn it off.
      env.useBrowserCache = true;
      const pipe = await pipeline('feature-extraction', MODEL, {
        dtype: 'q8',
        progress_callback: (p: LoadProgress) => onProgress?.(p),
      });
      const embed: EmbedFn = async (text: string) => {
        const out = await pipe(text, { pooling: 'mean', normalize: true });
        return new Float32Array(out.data as Float32Array);
      };
      const centroids: Centroid[] = [];
      for (const intent of INTENTS) {
        if (intent.examples.length === 0) continue;
        const vectors = await Promise.all(intent.examples.map(embed));
        centroids.push({ intent, vector: meanPool(vectors) });
      }
      return { embed, centroids };
    })();
  }
  return bootstrap.then(() => undefined);
}

export async function classify(text: string): Promise<ClassifyResult> {
  if (!bootstrap) {
    throw new Error('classifier not loaded — call loadClassifier() first');
  }
  const { embed, centroids } = await bootstrap;
  const query = await embed(text);

  const scored = centroids.map((c) => ({
    intent: c.intent.id,
    score: cosine(query, c.vector),
  }));
  scored.sort((a, b) => b.score - a.score);

  const top1 = scored[0];
  const intent: IntentId = top1 && top1.score >= OTHER_THRESHOLD ? top1.intent : 'other';

  return {
    intent,
    confidence: top1?.score ?? 0,
    top: scored.slice(0, 3),
  };
}

function meanPool(vectors: Float32Array[]): Float32Array {
  const n = vectors[0].length;
  const acc = new Float32Array(n);
  for (const v of vectors) {
    for (let i = 0; i < n; i++) acc[i] += v[i];
  }
  for (let i = 0; i < n; i++) acc[i] /= vectors.length;
  let mag = 0;
  for (let i = 0; i < n; i++) mag += acc[i] * acc[i];
  mag = Math.sqrt(mag) || 1;
  for (let i = 0; i < n; i++) acc[i] /= mag;
  return acc;
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
