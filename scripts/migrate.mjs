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
import { readdirSync } from "node:fs";
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
function wrangler(args) {
  // --yes so the CF build auto-installs wrangler via npx without prompting.
  return execFileSync(npx, ["--yes", "wrangler", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
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
  // automation existed: ADOPT it — record current migrations as applied WITHOUT
  // re-running them (0001's CREATE TABLEs / the ALTERs would error on re-run).
  // A truly fresh DB has no `patients` table and falls through to run everything.
  for (const f of files) sql(`INSERT OR IGNORE INTO applied_migrations (name) VALUES ('${f}')`);
  console.log(
    `[migrate] adopted existing remote DB — recorded ${files.length} migration(s) as applied (no SQL re-run).`,
  );
  process.exit(0);
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
