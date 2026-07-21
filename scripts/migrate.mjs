#!/usr/bin/env node
/**
 * Apply pending D1 migrations to the `drkyana` database, idempotently.
 *
 * Targets both the REMOTE (production) DB and the LOCAL dev DB from one script,
 * because the "which files are pending" logic is identical and drifted badly
 * when it wasn't: `db:migrate:local` used to hardcode `--file=0001_init.sql`, so
 * local dev never received migrations 0002+ at all.
 *
 *   node scripts/migrate.mjs                 # remote, gated to CF prod builds
 *   node scripts/migrate.mjs --remote --force  # remote, manual run
 *   node scripts/migrate.mjs --local           # local dev DB, never gated
 *
 * WHY (remote): Cloudflare Pages deploys the patient site on every push to main
 * but does NOT apply D1 migrations — so code reading a new column could ship
 * before its migration and 500 the patient API (this bit us with 0006). This
 * runs as the FIRST step of the Pages production build (`npm run cf:build`), so
 * schema is always loaded before new code is published.
 *
 * HOW: a tracking table `applied_migrations(name)` records which
 * `migrations/NNNN_*.sql` files have run; only new ones are applied, in order.
 * Re-runs are no-ops. Failing here fails the build on purpose — we must NOT
 * publish code whose schema didn't apply.
 *
 * GATING (remote only): only mutates the prod DB on the production branch.
 * Cloudflare sets CF_PAGES=1 and CF_PAGES_BRANCH=<branch>; preview branches
 * skip. Pass --force for a manual run.
 *
 * AUTH (remote only): wrangler reads CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
 * from the environment (set as Pages build env vars). No token lives in the repo.
 */
import { readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const DB = "drkyana";
const DIR = "migrations";
const PROD_BRANCH = "main";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

const local = process.argv.includes("--local");
const target = local ? "--local" : "--remote";
const label = local ? "local" : "remote";

// --- Gate ---------------------------------------------------------------
// The local DB is disposable dev state — never gated.
if (!local) {
  const onCF = process.env.CF_PAGES === "1";
  const branch = process.env.CF_PAGES_BRANCH ?? "";
  const force = process.argv.includes("--force");
  if (onCF && branch !== PROD_BRANCH) {
    console.log(`[migrate] CF preview build (branch="${branch}") — skipping remote migrate.`);
    process.exit(0);
  }
  if (!onCF && !force) {
    console.log("[migrate] not a CF production build and no --force — skipping.");
    process.exit(0);
  }
}

// --- wrangler helpers ---------------------------------------------------

/** Turn a wrangler failure into a legible, actionable message and exit 1. */
function failWithDiagnosis(err) {
  const out = `${err?.stdout ?? ""}${err?.stderr ?? ""}`;
  // Cloudflare API auth failure (missing/expired token, or a token lacking the
  // D1 permission). This is the failure a Pages build hits when CLOUDFLARE_API_TOKEN
  // is unset or under-scoped — the raw execFileSync stack trace buries it.
  const isAuth = /Authentication error|code:\s*10000|\b10000\b/.test(out);
  console.error("\n[migrate] wrangler could not reach the D1 API.\n");
  if (isAuth) {
    console.error(
      "  Cause: Cloudflare API authentication failed (code 10000).\n\n" +
        "  The remote migrate runs `wrangler d1 execute --remote`, which needs an\n" +
        "  API token. On a Pages build that comes from the build environment\n" +
        "  variables, NOT from an interactive login. Check, in the Pages project\n" +
        "  → Settings → Variables and Secrets (Production):\n\n" +
        "    • CLOUDFLARE_API_TOKEN — set, not expired, and carrying the\n" +
        "        \x1b[1mAccount → D1 → Edit\x1b[0m permission on this account.\n" +
        "        A token scoped only to Pages/Workers will fail here with 10000.\n" +
        "    • CLOUDFLARE_ACCOUNT_ID — the account that owns the `drkyana` D1.\n\n" +
        "  Create/repair the token at dash.cloudflare.com → My Profile → API Tokens\n" +
        "  (or use the 'Edit Cloudflare Workers' template, then add D1 → Edit).\n",
    );
  } else {
    // Some other wrangler failure — surface CF's own error text, not our stack.
    console.error(out.trim() || String(err?.message ?? err));
  }
  process.exit(1);
}

function wrangler(args) {
  // --yes so the CF build auto-installs wrangler via npx without prompting.
  try {
    return execFileSync(npx, ["--yes", "wrangler", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    failWithDiagnosis(err);
  }
}
const sql = (command) =>
  wrangler(["d1", "execute", DB, target, "--json", "--command", command]);
const runFile = (file) =>
  wrangler(["d1", "execute", DB, target, "--file", `${DIR}/${file}`]);

function rows(jsonOut) {
  try {
    const parsed = JSON.parse(jsonOut);
    return parsed[0]?.results ?? [];
  } catch {
    return [];
  }
}

// --- Apply pending migrations ------------------------------------------
sql(
  "CREATE TABLE IF NOT EXISTS applied_migrations (" +
    "name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL DEFAULT (unixepoch()))",
);
const applied = new Set(rows(sql("SELECT name FROM applied_migrations")).map((r) => r.name));

const files = readdirSync(DIR)
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort();

const initialized = () =>
  rows(sql("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='patients' LIMIT 1"))
    .length > 0;

/** Tables/columns a migration creates, parsed from its SQL. */
function declaredObjects(file) {
  const sqlText = readFileSync(`${DIR}/${file}`, "utf8");
  const tables = [...sqlText.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][\w]*)/gi)]
    .map((m) => m[1]);
  const columns = [
    ...sqlText.matchAll(/ALTER\s+TABLE\s+([A-Za-z_][\w]*)\s+ADD\s+COLUMN\s+([A-Za-z_][\w]*)/gi),
  ].map((m) => ({ table: m[1], column: m[2] }));
  return { tables, columns };
}

/** Is every object this migration declares already present in the DB? */
function alreadyApplied(file) {
  const { tables, columns } = declaredObjects(file);
  if (tables.length === 0 && columns.length === 0) return false; // can't prove it — don't assume
  for (const t of tables) {
    if (rows(sql(`SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='${t}' LIMIT 1`)).length === 0) {
      return false;
    }
  }
  for (const { table, column } of columns) {
    const cols = rows(sql(`PRAGMA table_info('${table}')`)).map((r) => r.name);
    if (!cols.includes(column)) return false;
  }
  return true;
}

if (applied.size === 0 && initialized()) {
  if (local) {
    // A local DB predating this tracking table was built by the old script,
    // which only ever ran 0001 — so 0002+ are genuinely missing and adopting
    // would hide that. The ALTER TABLEs in 0002/0003/0006 would also fail on a
    // partial re-run. Resetting is cheap and unambiguous for dev state.
    console.error(
      "[migrate] local DB exists but has no migration tracking — it predates this script.\n" +
        "          Reset it and re-run:  rm -rf .wrangler/state/v3/d1  (PowerShell: Remove-Item -Recurse -Force .wrangler/state/v3/d1)",
    );
    process.exit(1);
  }
  // Remote first run against a DB initialized out-of-band, before this
  // automation existed: ADOPT it — record migrations as applied WITHOUT
  // re-running them (0001's CREATE TABLEs / the ALTERs would error on re-run).
  //
  // CRITICAL: adopt only migrations we can PROVE are already applied, and stop
  // at the first one we cannot. The original version adopted every file on
  // disk, which assumed the live DB was at the latest migration. That
  // assumption broke the moment a migration merged before the automation was
  // switched on: prod was missing 0007 (admin_actions, merged 2026-07-05) and
  // 0008 (consents), and blanket adoption would have recorded both as applied
  // while their tables did not exist — masking the gap permanently instead of
  // fixing it. Stopping at the first unprovable migration means the rest fall
  // through and actually run.
  const adoptable = [];
  for (const f of files) {
    if (!alreadyApplied(f)) break;
    adoptable.push(f);
  }
  for (const f of adoptable) {
    sql(`INSERT OR IGNORE INTO applied_migrations (name) VALUES ('${f}')`);
    applied.add(f);
  }
  const remaining = files.length - adoptable.length;
  console.log(
    `[migrate] adopted existing remote DB — recorded ${adoptable.length} migration(s) as already applied` +
      (remaining
        ? `; ${remaining} genuinely pending, applying now.`
        : " (no SQL re-run)."),
  );
  // Deliberately fall THROUGH rather than exiting: anything we could not prove
  // was already applied is real pending work and must actually run.
}

const pending = files.filter((f) => !applied.has(f));

if (pending.length === 0) {
  console.log(`[migrate] ${label} schema up to date (${files.length} migration(s) tracked).`);
  process.exit(0);
}

for (const f of pending) {
  console.log(`[migrate] applying ${f} to ${label} …`);
  runFile(f);
  sql(`INSERT INTO applied_migrations (name) VALUES ('${f}')`);
  console.log(`[migrate] ✓ ${f}`);
}
console.log(`[migrate] applied ${pending.length} new migration(s) to ${label}.`);
