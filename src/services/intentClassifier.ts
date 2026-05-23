// On-device intent classifier: Transformers.js v4 + multilingual MiniLM.
// Preloaded on intersection (not page mount), cached in Cache Storage with
// persistent-storage opt-in. Retries with exponential backoff on cold-start
// network failure. ONNX WASM auto-resolved from onnxruntime-web on jsDelivr.

import { INTENTS, type Intent, type IntentId } from './intents';

const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const OTHER_THRESHOLD = 0.42; // empirical floor; below this we route to 'other'
const RETRY_DELAYS_MS = [1000, 3000, 9000];

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
let persistRequested = false;

export function isModelReady(): boolean {
  return modelReady;
}

// Cache probe — does at least one model file already live in Cache Storage?
// Returns false on any error or in environments without Cache API.
export async function isModelCached(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const names = await caches.keys();
    for (const name of names) {
      if (!name.includes('transformers')) continue;
      const cache = await caches.open(name);
      const keys = await cache.keys();
      if (keys.some((req) => req.url.includes(MODEL))) return true;
    }
  } catch {
    // ignore — fall through to false
  }
  return false;
}

// Ask the browser to keep our cache persistent so it survives quota pressure.
// Safe to call repeatedly; only fires once. No-op on browsers without the API.
export async function requestPersistentStorage(): Promise<boolean> {
  if (persistRequested) return false;
  persistRequested = true;
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export function loadClassifier(onProgress?: (p: LoadProgress) => void): Promise<void> {
  if (!bootstrap) {
    bootstrap = bootstrapWithRetry(onProgress).catch((err) => {
      bootstrap = null; // allow retry on next call
      throw err;
    });
  }
  return bootstrap.then(() => undefined);
}

async function bootstrapWithRetry(
  onProgress?: (p: LoadProgress) => void,
): Promise<{ embed: EmbedFn; centroids: Centroid[] }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await doBootstrap(onProgress);
    } catch (err) {
      lastErr = err;
      if (attempt === RETRY_DELAYS_MS.length) break;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastErr;
}

async function doBootstrap(
  onProgress?: (p: LoadProgress) => void,
): Promise<{ embed: EmbedFn; centroids: Centroid[] }> {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  // Optional edge-cached proxy. When set, transformers.js fetches model files
  // through CF's global edge instead of hitting huggingface.co directly.
  const proxy = (import.meta.env.VITE_MODEL_PROXY_URL as string | undefined)?.trim();
  if (proxy) env.remoteHost = proxy.replace(/\/$/, '');
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
