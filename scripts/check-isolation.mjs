#!/usr/bin/env node
/**
 * Code-isolation guard (no deps). Enforces the hard rule:
 *   "No admin/agent code, prompts, or tool implementations in a client bundle."
 *
 * Two checks:
 *   1. STATIC: no file imports `@drkyana/server` unless it lives in an allowed
 *      server-only location (route handlers, server actions, *.server.ts, the
 *      server package itself).
 *   2. OUTPUT (optional, --dist): scan built client assets for sentinel strings
 *      that must never ship (system-prompt markers, internal tool names).
 *
 * Usage:
 *   node scripts/check-isolation.mjs            # static check
 *   node scripts/check-isolation.mjs --dist     # also scan built assets
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = process.cwd();
// Match real import/require of the server package, not mentions in comments.
const FORBIDDEN_IMPORT =
  /(?:from\s+|import\s*\(\s*|require\(\s*)["']@drkyana\/server(?:\/[^"']*)?["']/;

// Where importing the server package IS allowed (server-only execution contexts).
const SERVER_ALLOW = [
  /packages[\\/]server[\\/]/,
  /apps[\\/]admin[\\/]app[\\/]api[\\/]/, // Next.js route handlers
  /apps[\\/]admin[\\/]server[\\/]/,
  /apps[\\/]ops[\\/]/, // drkyana-ops Worker — scheduled jobs, server-only, no client bundle
  /^functions[\\/]/, // Cloudflare Pages Functions (patient server endpoints)
  /\.server\.(ts|tsx|js|mjs)$/,
  /route\.(ts|js)$/, // Next.js route handlers
];

// Sentinels that must never appear in shipped CLIENT assets.
//
// These target the three things that are genuinely server-only: system prompts,
// tool *implementation* bodies, and credentials. They deliberately do NOT include
// tool *names*. In AI SDK 6 generative UI the tool-call stream the client renders
// is keyed by tool name (parts arrive as `tool-<name>`; see AgentChat.tsx
// `toolNameOf`), so names necessarily cross the boundary and are not secret.
// A leaked prompt still trips "You are Dr Kyana"; a leaked tool body still trips
// "needsApproval"; a leaked secret still trips "ANTHROPIC_API_KEY"; and Check 1
// still bans any `@drkyana/server` import into a client context.
const OUTPUT_SENTINELS = [
  "You are Dr Kyana", // system-prompt opener
  "needsApproval", // marker present in any leaked tool definition body
  "ANTHROPIC_API_KEY",
  // Dr Kyana's personal WhatsApp number. Removed from the patient site
  // deliberately (publishing it invites patient contact outside any consent,
  // record, or audit trail); it now lives only as the DR_KYANA_WHATSAPP
  // Worker secret for the admin-initiated escalation flow. This sentinel makes
  // a re-introduction into a client bundle fail the build rather than ship.
  "8801614369673",
];

const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".next", "build", ".wrangler"]);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

let failures = 0;

// --- Check 1: static import boundary ---
for (const file of walk(ROOT)) {
  if (!CODE_EXT.has(extname(file))) continue;
  const rel = file.slice(ROOT.length + 1);
  const text = readFileSync(file, "utf8");
  if (!FORBIDDEN_IMPORT.test(text)) continue;
  const allowed = SERVER_ALLOW.some((re) => re.test(rel));
  if (!allowed) {
    console.error(`✗ client-side import of @drkyana/server: ${rel}`);
    failures++;
  }
}

// --- Check 2: built client output sentinel scan ---
if (process.argv.includes("--dist")) {
  const distDirs = ["dist", "apps/admin/.next/static", "apps/patient/dist"].filter(existsSync);
  for (const d of distDirs) {
    for (const file of walk(join(ROOT, d))) {
      if (![".js", ".css", ".html"].includes(extname(file))) continue;
      const text = readFileSync(file, "utf8");
      for (const s of OUTPUT_SENTINELS) {
        if (text.includes(s)) {
          console.error(`✗ sentinel "${s}" leaked into client asset: ${file.slice(ROOT.length + 1)}`);
          failures++;
        }
      }
    }
  }
}

if (failures > 0) {
  console.error(`\nisolation check FAILED with ${failures} violation(s).`);
  process.exit(1);
}
console.log("isolation check passed.");
