/**
 * OAuth 2.1 authorization layer for the admin MCP endpoint — what lets the
 * Claude and ChatGPT NATIVE apps (iOS/iPad/web) connect to /api/mcp.
 *
 * Why: those clients cannot attach Cloudflare Access service-token headers;
 * the MCP auth spec (2025-06-18+) says a remote server advertises an OAuth
 * authorization server via protected-resource metadata, and clients register
 * dynamically (RFC 7591), then run authorization-code + PKCE in the system
 * browser. This module implements exactly that subset:
 *
 *   - RFC 8414 authorization-server metadata      (buildAuthServerMetadata)
 *   - RFC 9728 protected-resource metadata        (buildProtectedResourceMetadata)
 *   - RFC 7591 dynamic client registration        (registerClient)
 *   - authorization_code + PKCE(S256, mandatory)  (renderAuthorizePage /
 *     completeAuthorize / exchangeToken)
 *   - refresh_token with rotation                 (exchangeToken)
 *   - bearer verification for /api/mcp            (verifyBearer)
 *
 * IDENTITY IS STILL CLOUDFLARE ACCESS. /oauth/authorize stays BEHIND the
 * Access SSO app: the browser hop forces Dr Kyana's Google sign-in, the route
 * verifies the Access JWT, and the consent she clicks binds that verified
 * email into the code → token. This module never authenticates a human
 * itself; it only converts "Access says this is the dentist" into a bearer
 * token native apps can hold. No new passwords, no client secrets (public
 * clients + PKCE).
 *
 * Storage: KV, prefix `oauth:` — clients, single-use codes (10 min), access
 * tokens (1 h), rotating refresh tokens (30 d), consent nonces (10 min).
 * Revoke everything by deleting the KV keys.
 *
 * CSRF on consent: the GET-rendered form carries a nonce stored in KV and
 * bound to a hash of the request params; the POST must return it. A foreign
 * page can't read our HTML (same-origin policy), so it can't auto-submit an
 * approval.
 */
import type { Env } from "../bindings";

// ---------------------------------------------------------------------------
// Small crypto/encoding helpers (Workers-native)
// ---------------------------------------------------------------------------

function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function base64url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256base64url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return base64url(digest);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// TTLs
// ---------------------------------------------------------------------------

const ACCESS_TOKEN_TTL = 3600; // 1 h — clients refresh silently
const REFRESH_TOKEN_TTL = 30 * 86400; // 30 d, rotated on every use
const CODE_TTL = 600;
const CONSENT_TTL = 600;

// ---------------------------------------------------------------------------
// Metadata (discovery)
// ---------------------------------------------------------------------------

export function buildAuthServerMetadata(origin: string): Record<string, unknown> {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  };
}

export function buildProtectedResourceMetadata(origin: string): Record<string, unknown> {
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: ["mcp"],
    bearer_methods_supported: ["header"],
    resource_name: "Dr Kyana admin MCP",
  };
}

/** The WWW-Authenticate challenge /api/mcp returns on 401 (drives discovery). */
export function bearerChallenge(origin: string): string {
  return `Bearer realm="drkyana", resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp"`;
}

// ---------------------------------------------------------------------------
// Dynamic client registration (RFC 7591) — public clients only
// ---------------------------------------------------------------------------

interface StoredClient {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  created_at: number;
}

function validRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol === "https:") return true;
    // Loopback redirects for dev tools (mcp-remote, MCP inspector).
    return (
      u.protocol === "http:" &&
      (u.hostname === "localhost" || u.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

export async function registerClient(
  env: Env,
  body: Record<string, unknown>,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const uris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u): u is string => typeof u === "string")
    : [];
  if (!uris.length || !uris.every(validRedirectUri)) {
    return {
      status: 400,
      payload: {
        error: "invalid_redirect_uri",
        error_description: "redirect_uris must be https (or localhost) URLs",
      },
    };
  }
  const client: StoredClient = {
    client_id: `mcp_${randomToken(16)}`,
    client_name:
      typeof body.client_name === "string" && body.client_name.trim()
        ? body.client_name.slice(0, 120)
        : "MCP client",
    redirect_uris: uris.slice(0, 10),
    created_at: Math.floor(Date.now() / 1000),
  };
  await env.KV.put(`oauth:client:${client.client_id}`, JSON.stringify(client));
  return {
    status: 201,
    payload: {
      client_id: client.client_id,
      client_name: client.client_name,
      redirect_uris: client.redirect_uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
  };
}

async function getClient(env: Env, clientId: string): Promise<StoredClient | null> {
  const raw = await env.KV.get(`oauth:client:${clientId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredClient;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Authorize (GET consent page → POST approval → code redirect)
// ---------------------------------------------------------------------------

export interface AuthorizeParams {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
  scope?: string;
  resource?: string;
}

interface AuthorizeCheck {
  client: StoredClient;
  params: Required<Pick<AuthorizeParams, "client_id" | "redirect_uri" | "code_challenge">> &
    AuthorizeParams;
}

async function checkAuthorizeParams(
  env: Env,
  p: AuthorizeParams,
): Promise<{ error: string } | AuthorizeCheck> {
  if (p.response_type !== "code") return { error: "response_type must be 'code'" };
  if (!p.client_id) return { error: "missing client_id" };
  const client = await getClient(env, p.client_id);
  if (!client) return { error: "unknown client_id — register first" };
  if (!p.redirect_uri || !client.redirect_uris.includes(p.redirect_uri)) {
    return { error: "redirect_uri is not registered for this client" };
  }
  // OAuth 2.1: PKCE is mandatory; only S256 accepted.
  if (!p.code_challenge || (p.code_challenge_method ?? "S256") !== "S256") {
    return { error: "PKCE with code_challenge_method=S256 is required" };
  }
  return {
    client,
    params: p as AuthorizeCheck["params"],
  };
}

function paramsHash(p: AuthorizeParams): Promise<string> {
  return sha256base64url(
    [p.client_id, p.redirect_uri, p.code_challenge, p.state ?? "", p.scope ?? "", p.resource ?? ""].join("\n"),
  );
}

/**
 * GET /oauth/authorize — the caller has ALREADY passed Cloudflare Access
 * (route is inside the SSO-protected app) and re-verified the JWT; `email`
 * is that verified identity. Returns HTML (consent page) or an error string.
 */
export async function renderAuthorizePage(
  env: Env,
  p: AuthorizeParams,
  email: string,
): Promise<{ html: string } | { error: string }> {
  const checked = await checkAuthorizeParams(env, p);
  if ("error" in checked) return checked;

  const nonce = randomToken(16);
  await env.KV.put(`oauth:consent:${nonce}`, await paramsHash(p), {
    expirationTtl: CONSENT_TTL,
  });

  const dest = new URL(checked.params.redirect_uri);
  const fields = Object.entries({ ...p, consent_nonce: nonce })
    .filter(([, v]) => typeof v === "string" && v !== "")
    .map(
      ([k, v]) =>
        `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(String(v))}">`,
    )
    .join("\n      ");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorize — Dr Kyana admin</title>
<style>
  body { font-family: 'Poppins', ui-sans-serif, system-ui, sans-serif; background:#f8fafc; color:#0f172a;
         display:flex; min-height:100vh; align-items:center; justify-content:center; margin:0; }
  .card { background:#fff; border:1px solid rgba(15,23,42,.12); border-radius:14px; padding:28px;
          max-width:420px; box-shadow:0 1px 2px rgba(15,23,42,.06); }
  h1 { font-size:18px; margin:0 0 12px; } p { font-size:14px; line-height:1.55; color:#475569; }
  strong { color:#0f172a; } .warn { font-size:12.5px; }
  button { font:inherit; font-weight:500; border-radius:8px; padding:9px 18px; cursor:pointer; margin-right:8px; }
  .ok { background:#0f4c81; border:1px solid #0f4c81; color:#fff; }
  .no { background:#fff; border:1px solid rgba(15,23,42,.2); color:#0f172a; }
</style></head><body>
  <div class="card">
    <h1>Connect to Dr Kyana's practice console?</h1>
    <p><strong>${escapeHtml(checked.client.client_name)}</strong> (redirects to
       <strong>${escapeHtml(dest.host)}</strong>) is asking to access the admin MCP
       tools as <strong>${escapeHtml(email)}</strong>.</p>
    <p class="warn">This grants the connected app the same access you have —
       patient records included. Only approve if you initiated this from your
       own Claude or ChatGPT app.</p>
    <form method="POST" action="/oauth/authorize">
      ${fields}
      <button class="ok" type="submit" name="decision" value="approve">Authorize</button>
      <button class="no" type="submit" name="decision" value="deny">Deny</button>
    </form>
  </div>
</body></html>`;
  return { html };
}

/**
 * POST /oauth/authorize (consent submit; still behind Access). Returns the
 * redirect target carrying the code, or the deny/error redirect.
 */
export async function completeAuthorize(
  env: Env,
  form: Record<string, string>,
  identity: { email: string; sub: string },
): Promise<{ redirect: string } | { error: string }> {
  const p = form as AuthorizeParams & { consent_nonce?: string; decision?: string };
  const checked = await checkAuthorizeParams(env, p);
  if ("error" in checked) return checked;

  // Consent nonce must exist and match this exact request's params.
  const nonceKey = `oauth:consent:${p.consent_nonce ?? ""}`;
  const expected = p.consent_nonce ? await env.KV.get(nonceKey) : null;
  if (!expected || expected !== (await paramsHash(p))) {
    return { error: "stale or invalid consent form — start the connect flow again" };
  }
  await env.KV.delete(nonceKey);

  const dest = new URL(checked.params.redirect_uri);
  if (p.state) dest.searchParams.set("state", p.state);

  if (p.decision !== "approve") {
    dest.searchParams.set("error", "access_denied");
    return { redirect: dest.toString() };
  }

  const code = randomToken(24);
  await env.KV.put(
    `oauth:code:${code}`,
    JSON.stringify({
      client_id: checked.params.client_id,
      redirect_uri: checked.params.redirect_uri,
      code_challenge: checked.params.code_challenge,
      email: identity.email,
      sub: identity.sub,
      scope: p.scope ?? "mcp",
    }),
    { expirationTtl: CODE_TTL },
  );
  dest.searchParams.set("code", code);
  return { redirect: dest.toString() };
}

// ---------------------------------------------------------------------------
// Token endpoint (code exchange + refresh rotation)
// ---------------------------------------------------------------------------

interface GrantIdentity {
  email: string;
  sub: string;
  client_id: string;
  scope: string;
}

async function issueTokens(env: Env, grant: GrantIdentity) {
  const access = randomToken(32);
  const refresh = randomToken(32);
  await env.KV.put(`oauth:tok:${access}`, JSON.stringify(grant), {
    expirationTtl: ACCESS_TOKEN_TTL,
  });
  await env.KV.put(`oauth:rt:${refresh}`, JSON.stringify(grant), {
    expirationTtl: REFRESH_TOKEN_TTL,
  });
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL,
    refresh_token: refresh,
    scope: grant.scope,
  };
}

export async function exchangeToken(
  env: Env,
  form: Record<string, string>,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const fail = (error: string, error_description: string, status = 400) => ({
    status,
    payload: { error, error_description },
  });

  if (form.grant_type === "authorization_code") {
    const key = `oauth:code:${form.code ?? ""}`;
    const raw = form.code ? await env.KV.get(key) : null;
    if (!raw) return fail("invalid_grant", "unknown or expired code");
    await env.KV.delete(key); // single-use, deleted before any other check
    let stored: {
      client_id: string;
      redirect_uri: string;
      code_challenge: string;
      email: string;
      sub: string;
      scope: string;
    };
    try {
      stored = JSON.parse(raw);
    } catch {
      return fail("invalid_grant", "corrupt code record");
    }
    if (form.client_id !== stored.client_id) {
      return fail("invalid_grant", "client_id mismatch");
    }
    if (form.redirect_uri && form.redirect_uri !== stored.redirect_uri) {
      return fail("invalid_grant", "redirect_uri mismatch");
    }
    if (
      !form.code_verifier ||
      (await sha256base64url(form.code_verifier)) !== stored.code_challenge
    ) {
      return fail("invalid_grant", "PKCE verification failed");
    }
    return {
      status: 200,
      payload: await issueTokens(env, {
        email: stored.email,
        sub: stored.sub,
        client_id: stored.client_id,
        scope: stored.scope,
      }),
    };
  }

  if (form.grant_type === "refresh_token") {
    const key = `oauth:rt:${form.refresh_token ?? ""}`;
    const raw = form.refresh_token ? await env.KV.get(key) : null;
    if (!raw) return fail("invalid_grant", "unknown or expired refresh token");
    await env.KV.delete(key); // rotation: old token dies on use
    let grant: GrantIdentity;
    try {
      grant = JSON.parse(raw);
    } catch {
      return fail("invalid_grant", "corrupt refresh record");
    }
    if (form.client_id && form.client_id !== grant.client_id) {
      return fail("invalid_grant", "client_id mismatch");
    }
    return { status: 200, payload: await issueTokens(env, grant) };
  }

  return fail("unsupported_grant_type", "use authorization_code or refresh_token");
}

// ---------------------------------------------------------------------------
// Bearer verification — used by /api/mcp before falling back to Access
// ---------------------------------------------------------------------------

export interface BearerIdentity {
  email: string;
  sub: string;
}

export async function verifyBearer(
  env: Env,
  req: Request,
): Promise<BearerIdentity | null> {
  const auth = req.headers.get("authorization") ?? "";
  if (!/^bearer /i.test(auth)) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  const raw = await env.KV.get(`oauth:tok:${token}`);
  if (!raw) return null;
  try {
    const grant = JSON.parse(raw) as GrantIdentity;
    if (!grant.email) return null;
    return { email: grant.email, sub: grant.sub || grant.email };
  } catch {
    return null;
  }
}
