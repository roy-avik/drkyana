// On-device generative receptionist: Gemma 3 270M (it) via Transformers.js v4.
// Experimental — gated by VITE_USE_GENERATIVE. Falls back to the embedding
// classifier in Receptionist.tsx when this fails to load or generate.
//
// Quality caveat: Gemma 3 270M is a fine-tuning base, not a production chat
// model. Out-of-the-box replies are short, sometimes incoherent, and the
// "never invent facts" constraint will occasionally leak. See PR notes.

import { FEWSHOT_TURNS, SYSTEM_PROMPT } from './receptionistPrompt';

const MODEL = 'onnx-community/gemma-3-270m-it-ONNX';
// Gemma 3 270M ONNX builds use GatherBlockQuantized embeddings, which only
// have a WebGPU kernel — so we hard-require WebGPU. Browsers without WebGPU
// (Firefox without the flag, older Safari) trip the load_failed path which
// offers a one-click switch to the classifier path.
const DTYPE = 'q4f16'; // ~273 MB; WebGPU-only path needs this
const DEVICE = 'webgpu' as const;
// A well-formed reply is two short lines (INTENT + SAY). 80 tokens is
// roughly 60 words — plenty of room for the structured output but not
// enough for the model to ramble into hallucinated extra examples.
const MAX_NEW_TOKENS = 80;
const RETRY_DELAYS_MS = [1000, 3000, 9000];

export type GenProgress = { status: string; file?: string; progress?: number };
export type ChatTurn = { role: 'user' | 'assistant'; content: string };

type GeneratorPipeline = {
  generate: (messages: ChatTurn[], onToken: (text: string) => void) => Promise<string>;
};

let bootstrap: Promise<GeneratorPipeline> | null = null;
let generatorReady = false;
let persistRequested = false;

export function isGeneratorReady(): boolean {
  return generatorReady;
}

export async function isGeneratorCached(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const names = await caches.keys();
    for (const name of names) {
      if (!name.includes('transformers')) continue;
      const cache = await caches.open(name);
      const keys = await cache.keys();
      if (keys.some((req) => req.url.includes('gemma-3-270m'))) return true;
    }
  } catch {
    // ignore
  }
  return false;
}

async function requestPersist(): Promise<void> {
  if (persistRequested) return;
  persistRequested = true;
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return;
  try {
    await navigator.storage.persist();
  } catch {
    // ignore
  }
}

export function loadGenerator(onProgress?: (p: GenProgress) => void): Promise<void> {
  if (!bootstrap) {
    void requestPersist();
    bootstrap = bootstrapWithRetry(onProgress).catch((err) => {
      bootstrap = null;
      throw err;
    });
  }
  return bootstrap.then(() => undefined);
}

async function bootstrapWithRetry(
  onProgress?: (p: GenProgress) => void,
): Promise<GeneratorPipeline> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await doBootstrap(onProgress);
    } catch (err) {
      lastErr = err;
      const e = err as Error;
      console.error('[receptionistGenerator] bootstrap attempt failed', attempt, e?.name, e?.message, e?.stack?.split('\n').slice(0, 5).join('\n'));
      if (attempt === RETRY_DELAYS_MS.length) break;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastErr;
}

async function doBootstrap(
  onProgress?: (p: GenProgress) => void,
): Promise<GeneratorPipeline> {
  const transformers = await import('@huggingface/transformers');
  const { pipeline, TextStreamer, env } = transformers;
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  // Optional edge-cached proxy. Same flag as the classifier path — when set,
  // model files come through CF's global edge instead of huggingface.co.
  const proxy = (import.meta.env.VITE_MODEL_PROXY_URL as string | undefined)?.trim();
  if (proxy) env.remoteHost = proxy.replace(/\/$/, '');


  if (typeof navigator !== 'undefined' && !('gpu' in navigator)) {
    throw new Error('WebGPU is not available in this browser');
  }
  const pipe = await pipeline('text-generation', MODEL, {
    dtype: DTYPE,
    device: DEVICE,
    progress_callback: (p: GenProgress) => onProgress?.(p),
  });

  generatorReady = true;

  const generate = async (
    messages: ChatTurn[],
    onToken: (text: string) => void,
  ): Promise<string> => {
    // System prompt holds the task definition + verified facts. Few-shot
    // exemplars are folded in as real user/assistant turn pairs — 270M
    // anchors on chat-template turns much more reliably than on text
    // embedded in the system message (which it tends to continue).
    const fullMessages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      ...FEWSHOT_TURNS,
      ...messages,
    ];

    let accumulated = '';
    const streamer = new TextStreamer(pipe.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (text: string) => {
        accumulated += text;
        onToken(text);
      },
    });

    await pipe(fullMessages, {
      max_new_tokens: MAX_NEW_TOKENS,
      do_sample: false,
      streamer,
    });

    return accumulated.trim();
  };

  return { generate };
}

export async function generateReply(
  messages: ChatTurn[],
  onToken: (text: string) => void,
): Promise<string> {
  if (!bootstrap) {
    throw new Error('generator not loaded — call loadGenerator() first');
  }
  const { generate } = await bootstrap;
  return generate(messages, onToken);
}
