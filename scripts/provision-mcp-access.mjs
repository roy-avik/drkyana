#!/usr/bin/env node
/**
 * Provision the Cloudflare Zero Trust configuration that the MCP OAuth flow
 * needs (docs/connect-agents.md) — idempotently, via the Cloudflare API.
 *
 * What it creates/updates: ONE path-scoped Access application named
 * "drkyana-mcp-public" with a single Bypass→Everyone policy covering:
 *
 *     <host>/.well-known            (OAuth discovery documents)
 *     <host>/api/oauth/register     (RFC 7591 DCR)
 *     <host>/api/oauth/token        (code/refresh exchange)
 *     <host>/api/mcp                (the Worker enforces bearer/Access auth)
 *
 * The main SSO application on <host> is left untouched — in Access, the most
 * specific host+path application wins, so these carve narrow exceptions out
 * of it. /oauth/authorize deliberately stays under the SSO app.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
 *     node scripts/provision-mcp-access.mjs --host admin.drkyana.com [--dry-run]
 *
 * Token permission needed: Account → Access: Apps and Policies → Edit.
 * Verify afterwards: node scripts/provision-mcp-access.mjs --host ... --verify
 */

const API = "https://api.cloudflare.com/client/v4";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const host = opt("host");
const dryRun = flag("dry-run");
const verifyOnly = flag("verify");

if (!host) {
  console.error("Missing --host <admin-hostname> (e.g. admin.drkyana.com)");
  process.exit(1);
}

const APP_NAME = "drkyana-mcp-public";
const PUBLIC_PATHS = [
  `${host}/.well-known`,
  `${host}/api/oauth/register`,
  `${host}/api/oauth/token`,
  `${host}/api/mcp`,
];

// ---------------------------------------------------------------------------
// --verify: probe the deployed endpoints (no credentials needed)
// ---------------------------------------------------------------------------
if (verifyOnly) {
  const checks = [
    {
      url: `https://${host}/.well-known/oauth-authorization-server`,
      ok: (res, body) => res.status === 200 && body.includes('"authorization_endpoint"'),
      why: "discovery metadata reachable without SSO",
    },
    {
      url: `https://${host}/.well-known/oauth-protected-resource/api/mcp`,
      ok: (res, body) => res.status === 200 && body.includes('"authorization_servers"'),
      why: "protected-resource metadata reachable",
    },
    {
      url: `https://${host}/api/mcp`,
      method: "POST",
      body: "{}",
      ok: (res) =>
        res.status === 401 && (res.headers.get("www-authenticate") ?? "").includes("resource_metadata"),
      why: "unauthenticated MCP call returns 401 + WWW-Authenticate (NOT an Access redirect)",
    },
    {
      url: `https://${host}/oauth/authorize`,
      ok: (res) => res.status === 302 || res.status === 401 || res.status === 403,
      why: "/oauth/authorize still challenges for SSO",
      redirect: "manual",
    },
  ];
  let failed = 0;
  for (const c of checks) {
    try {
      const res = await fetch(c.url, {
        method: c.method ?? "GET",
        body: c.body,
        redirect: c.redirect ?? "follow",
        headers: c.body ? { "content-type": "application/json" } : undefined,
      });
      const text = await res.text().catch(() => "");
      const pass = c.ok(res, text);
      console.log(`${pass ? "PASS" : "FAIL"}  [${res.status}] ${c.url} — ${c.why}`);
      if (!pass) failed++;
    } catch (e) {
      console.log(`FAIL  ${c.url} — ${e.message}`);
      failed++;
    }
  }
  process.exit(failed ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Provision via API
// ---------------------------------------------------------------------------
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !account) {
  console.error(
    "CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required (token scope: Access: Apps and Policies → Edit).",
  );
  process.exit(1);
}

async function cf(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(`${method} ${path} failed: ${JSON.stringify(json.errors)}`);
  }
  return json.result;
}

const appPayload = {
  name: APP_NAME,
  type: "self_hosted",
  domain: PUBLIC_PATHS[0],
  self_hosted_domains: PUBLIC_PATHS,
  session_duration: "24h",
  app_launcher_visible: false,
  // Single inline policy: Bypass for everyone. Safe because every one of
  // these paths is self-protecting (see docs/connect-agents.md).
  policies: [
    {
      name: "Public MCP/OAuth endpoints (worker enforces auth)",
      decision: "bypass",
      include: [{ everyone: {} }],
    },
  ],
};

const apps = await cf("GET", `/accounts/${account}/access/apps?per_page=100`);
const existing = (apps ?? []).find((a) => a.name === APP_NAME);

if (dryRun) {
  console.log(existing ? `Would UPDATE app ${existing.id}:` : "Would CREATE app:");
  console.log(JSON.stringify(appPayload, null, 2));
  process.exit(0);
}

if (existing) {
  const updated = await cf(
    "PUT",
    `/accounts/${account}/access/apps/${existing.id}`,
    appPayload,
  );
  console.log(`Updated Access app ${updated.id} (${APP_NAME}) covering:`);
} else {
  const created = await cf("POST", `/accounts/${account}/access/apps`, appPayload);
  console.log(`Created Access app ${created.id} (${APP_NAME}) covering:`);
}
for (const p of PUBLIC_PATHS) console.log(`  - ${p}  → Bypass (worker-enforced auth)`);
console.log(
  `\nLeft untouched: the SSO app on ${host} (still guards /oauth/authorize and the console).` +
    `\nNext: node scripts/provision-mcp-access.mjs --host ${host} --verify`,
);
