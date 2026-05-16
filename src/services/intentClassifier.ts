// On-device intent classifier: Transformers.js v4 + multilingual MiniLM.
// Preloaded on page visit, cached in Cache Storage (env.useBrowserCache).
// ONNX WASM auto-resolved from onnxruntime-web on jsDelivr by v4.

import { INTENTS, type Intent, type IntentId } from './intents';

const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const OTHER_THRESHOLD = 0.42; // empirical floor; below this we route to 'other'

export type ClassifyResult = {
  intent: IntentId;
  confidence: number;
  top: Array<{ intent: IntentId; score: number }>;
};

export type LoadProgress = { status: string; file?: string; progress?: number };

type EmbedFn = (text: string) => Promise<Float32Array>;

type Centroid = { intent: Intent; vector: Float32Array };

let bootstrap: Promise<{ embed: EmbedFn; centroids: Centroid[] }> | null = null;
let modelReady = false;

export function isModelReady(): boolean {
  return modelReady;
}

export function loadClassifier(onProgress?: (p: LoadProgress) => void): Promise<void> {
  if (!bootstrap) {
    bootstrap = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      // v4 auto-resolves ONNX Runtime WASM from the onnxruntime-web package
      // on jsDelivr — no manual wasmPaths override needed. The WASM files
      // are stripped from the Vite build (see skipOnnxWasmAssets plugin).
      env.allowLocalModels = false;
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
      modelReady = true;
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
