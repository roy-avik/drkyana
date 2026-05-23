// Edge-caching proxy for the on-device receptionist models.
//
// transformers.js v4 fetches model files from huggingface.co — for patients
// in Dhaka/Iran this lands on HF's US-East-backed CDN with ~150-300 ms RTT
// and the presigned URLs expire in an hour (the source of our retry path).
//
// This Worker proxies any path through to huggingface.co and lets Cloudflare's
// global edge cache do the rest. First request from each colo eats the
// upstream latency; everything after that is local.
//
// The classifier and generative services set `env.remoteHost` to this Worker's
// URL, so the rest of the transformers.js fetch pipeline is unchanged.

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, ETag, Accept-Ranges',
  'Access-Control-Max-Age': '86400',
};

const UPSTREAM = 'https://huggingface.co';
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const upstreamUrl = `${UPSTREAM}${url.pathname}${url.search}`;

    const forwardHeaders: HeadersInit = {};
    const range = request.headers.get('range');
    if (range) forwardHeaders['Range'] = range;

    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers: forwardHeaders,
      // Tell Cloudflare's edge to cache aggressively — these are versioned
      // immutable model files for a given (model, revision) pair.
      cf: {
        cacheTtl: CACHE_TTL_SECONDS,
        cacheEverything: true,
      },
    });

    const headers = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
    headers.set('Cache-Control', `public, max-age=${CACHE_TTL_SECONDS}, immutable`);

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  },
};
