// R2-backed CDN for the on-device receptionist models.
//
// R2 is the source of truth. On every GET we try R2 first; on a miss we
// pull the file from huggingface.co exactly once, stream it back to the
// requesting client AND into R2 in parallel, and from that point on every
// subsequent request — anywhere in the world — serves directly from R2
// with CF's edge cache in front for free.
//
// Why this beats the proxy-through-HF approach: HF presigned URLs expire in
// an hour, the response gets cached at the edge but the edge can evict, and
// we depend on HF's uptime. With R2 as origin we own the data, the URLs
// never expire, and the Worker becomes ~80 lines that don't need updating
// when HF changes anything.

interface Env {
  MODELS: R2Bucket;
}

const UPSTREAM = 'https://huggingface.co';
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, ETag, Accept-Ranges',
  'Access-Control-Max-Age': '86400',
};

// Files the cron job ensures exist in R2. Keys mirror the HF resolve paths.
// Add to this list whenever we adopt a new on-device model — the daily cron
// will pull it once and patients never pay the cold-start HF latency.
const MIRROR_MANIFEST: readonly string[] = [
  // Classifier — Xenova/paraphrase-multilingual-MiniLM-L12-v2 (q8)
  'Xenova/paraphrase-multilingual-MiniLM-L12-v2/resolve/main/config.json',
  'Xenova/paraphrase-multilingual-MiniLM-L12-v2/resolve/main/tokenizer.json',
  'Xenova/paraphrase-multilingual-MiniLM-L12-v2/resolve/main/tokenizer_config.json',
  'Xenova/paraphrase-multilingual-MiniLM-L12-v2/resolve/main/special_tokens_map.json',
  'Xenova/paraphrase-multilingual-MiniLM-L12-v2/resolve/main/onnx/model_quantized.onnx',

  // Generative experiment — onnx-community/gemma-3-270m-it-ONNX (q4f16)
  'onnx-community/gemma-3-270m-it-ONNX/resolve/main/config.json',
  'onnx-community/gemma-3-270m-it-ONNX/resolve/main/tokenizer.json',
  'onnx-community/gemma-3-270m-it-ONNX/resolve/main/tokenizer_config.json',
  'onnx-community/gemma-3-270m-it-ONNX/resolve/main/special_tokens_map.json',
  'onnx-community/gemma-3-270m-it-ONNX/resolve/main/generation_config.json',
  'onnx-community/gemma-3-270m-it-ONNX/resolve/main/onnx/model_q4f16.onnx',
  'onnx-community/gemma-3-270m-it-ONNX/resolve/main/onnx/model_q4f16.onnx_data',
];

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const start = Date.now();
    const reqId =
      request.headers.get('cf-ray') ?? crypto.randomUUID().slice(0, 8);
    const colo = (request.cf as { colo?: string } | undefined)?.colo ?? 'unknown';

    if (request.method === 'OPTIONS') {
      log('cors_preflight', { reqId, colo, ms: Date.now() - start });
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      log('method_not_allowed', { reqId, colo, method: request.method, ms: Date.now() - start });
      return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const key = url.pathname.replace(/^\/+/, '');
    if (!key || key.endsWith('/')) {
      log('not_found', { reqId, colo, path: url.pathname, ms: Date.now() - start });
      return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
    }

    const range = parseRangeHeader(request.headers.get('range'));

    // 1) Try R2 first.
    const r2Start = Date.now();
    const object = await env.MODELS.get(key, range ? { range } : undefined);
    const r2Ms = Date.now() - r2Start;
    if (object) {
      log('r2_hit', {
        reqId,
        colo,
        key,
        method: request.method,
        range: range ? formatRange(range) : null,
        bytes: object.size,
        r2_ms: r2Ms,
        total_ms: Date.now() - start,
      });
      return r2ResponseFor(object, request, range);
    }

    // 2) R2 miss — pull from HuggingFace once, tee body into the response
    //    and into R2 in parallel.
    log('r2_miss', { reqId, colo, key, method: request.method, r2_ms: r2Ms });
    return await backfillFromHF(env, ctx, key, url.search, request, reqId, colo, start);
  },

  // Daily cron — ensures every file in MIRROR_MANIFEST exists in R2.
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    log('cron_fired', { cron: controller.cron, scheduledTime: controller.scheduledTime });
    ctx.waitUntil(mirrorAll(env));
  },
};

// One-line structured log. event = short identifier, fields = JSON-safe map.
// In Workers Observability the dashboard parses this and lets us filter on
// any field.
function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ts: Date.now(), ...fields }));
}

function formatRange(r: R2Range): string {
  if ('suffix' in r) return `suffix=${r.suffix}`;
  if ('length' in r && r.length !== undefined) {
    return `${r.offset ?? 0}-${(r.offset ?? 0) + r.length - 1}`;
  }
  return `${r.offset ?? 0}-`;
}

async function mirrorAll(env: Env): Promise<void> {
  const cronStart = Date.now();
  let pulled = 0;
  let skipped = 0;
  let failed = 0;
  for (const key of MIRROR_MANIFEST) {
    const fileStart = Date.now();
    try {
      const existing = await env.MODELS.head(key);
      if (existing) {
        skipped++;
        log('cron_skip', { key, bytes: existing.size, ms: Date.now() - fileStart });
        continue;
      }
      const upstream = await fetch(`${UPSTREAM}/${key}`, { redirect: 'follow' });
      if (!upstream.ok || !upstream.body) {
        log('cron_upstream_fail', { key, status: upstream.status, ms: Date.now() - fileStart });
        failed++;
        continue;
      }
      await env.MODELS.put(key, upstream.body, {
        httpMetadata: {
          contentType: upstream.headers.get('content-type') ?? 'application/octet-stream',
        },
      });
      pulled++;
      log('cron_pulled', {
        key,
        contentType: upstream.headers.get('content-type'),
        bytes: upstream.headers.get('content-length'),
        ms: Date.now() - fileStart,
      });
    } catch (err) {
      log('cron_error', {
        key,
        error: err instanceof Error ? err.message : String(err),
        ms: Date.now() - fileStart,
      });
      failed++;
    }
  }
  log('cron_done', {
    pulled,
    skipped,
    failed,
    total: MIRROR_MANIFEST.length,
    ms: Date.now() - cronStart,
  });
}

async function backfillFromHF(
  env: Env,
  ctx: ExecutionContext,
  key: string,
  search: string,
  request: Request,
  reqId: string,
  colo: string,
  start: number,
): Promise<Response> {
  const upstreamUrl = `${UPSTREAM}/${key}${search}`;
  const hfStart = Date.now();

  // Important: do NOT forward the client's Range header on the backfill
  // fetch — we want the *whole* file so R2 has the complete object. Once
  // R2 is populated, subsequent range requests are served from R2 directly.
  const upstream = await fetch(upstreamUrl, {
    method: 'GET',
    redirect: 'follow',
  });

  if (!upstream.ok || !upstream.body) {
    log('hf_fetch_fail', {
      reqId,
      colo,
      key,
      status: upstream.status,
      hf_ms: Date.now() - hfStart,
      total_ms: Date.now() - start,
    });
    return new Response(`Upstream fetch failed (${upstream.status})`, {
      status: upstream.status,
      headers: CORS_HEADERS,
    });
  }

  // Split the body — one half to the client, the other into R2 via waitUntil.
  const [toR2, toClient] = upstream.body.tee();

  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
  const contentLengthHeader = upstream.headers.get('content-length');
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : undefined;

  log('hf_backfill_started', {
    reqId,
    colo,
    key,
    contentType,
    bytes: contentLength,
    hf_response_ms: Date.now() - hfStart,
    total_ms: Date.now() - start,
  });

  const putStart = Date.now();
  ctx.waitUntil(
    env.MODELS.put(key, toR2, {
      httpMetadata: { contentType },
    })
      .then(() => {
        log('r2_put_done', { reqId, key, bytes: contentLength, put_ms: Date.now() - putStart });
      })
      .catch((err) => {
        log('r2_put_failed', {
          reqId,
          key,
          error: err instanceof Error ? err.message : String(err),
          put_ms: Date.now() - putStart,
        });
      }),
  );

  const headers = new Headers();
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  headers.set('Content-Type', contentType);
  if (contentLength !== undefined) headers.set('Content-Length', String(contentLength));
  headers.set('Cache-Control', `public, max-age=${CACHE_TTL_SECONDS}, immutable`);
  headers.set('X-Source', 'huggingface-backfill');
  headers.set('Accept-Ranges', 'bytes');

  // For the very first request we always stream the full file, even if the
  // client asked for a Range — the next request can hit R2 with its Range.
  return new Response(request.method === 'HEAD' ? null : toClient, {
    status: 200,
    headers,
  });
}

function r2ResponseFor(
  object: R2ObjectBody,
  request: Request,
  range: R2Range | undefined,
): Response {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  headers.set('Cache-Control', `public, max-age=${CACHE_TTL_SECONDS}, immutable`);
  headers.set('ETag', object.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('X-Source', 'r2');

  const isHead = request.method === 'HEAD';

  if (range && 'offset' in range && 'length' in range) {
    const start = range.offset ?? 0;
    const end = start + (range.length ?? 0) - 1;
    headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`);
    headers.set('Content-Length', String(range.length ?? 0));
    return new Response(isHead ? null : object.body, { status: 206, headers });
  }

  headers.set('Content-Length', String(object.size));
  return new Response(isHead ? null : object.body, { status: 200, headers });
}

// Parses a single-range "bytes=START-END" header into an R2Range. Returns
// undefined for missing/multi-range/malformed headers — those fall through
// to a full-object fetch.
function parseRangeHeader(header: string | null): R2Range | undefined {
  if (!header) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return undefined;
  const [, startStr, endStr] = match;
  if (startStr === '' && endStr === '') return undefined;
  if (startStr === '') {
    // suffix length, e.g. "bytes=-500"
    return { suffix: Number(endStr) };
  }
  const start = Number(startStr);
  if (endStr === '') {
    return { offset: start };
  }
  return { offset: start, length: Number(endStr) - start + 1 };
}
