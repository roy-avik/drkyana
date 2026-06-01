#!/usr/bin/env node
/**
 * Apply pending D1 migrations to the REMOTE `drkyana` database, idempotently.
 *
 * WHY: Cloudflare Pages deploys the patient site (build + Functions) on every
 * push to main, but it does NOT apply D1 migrations — so code that reads a new
 * column could ship before its migration and 500 the patient API (this bit us
 * with 0006). This runs as the FIRST step of the Pages production build
 * (`npm run cf:build`), so the schema is always loaded before the new code is
 * published.
 *
 * HOW: a tiny tracking table `applied_migrations(name)` records which
 * `migrations/NNNN_*.sql` files have run; only new ones are applied, in order.
 * Re-runs are no-ops. Failing here fails the build on purpose — we must NOT
 * publish code whose schema didn't apply.
 *
 * GATING: only mutates the remote (prod) DB on the production branch. Cloudflare
 * sets CF_PAGES=1 and CF_PAGES_BRANCH=<branch> in the build; preview branches
 * skip. For a manual local run, pass --force (e.g. `npm run db:migrate:remote`).
 *
 * AUTH: wrangler reads CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID from the
 * environment (set as Pages build env vars). No token lives in the repo.
 */
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const DB = "drkyana";
const DIR = "migrations";
const PROD_BRANCH = "main";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

// --- Gate ---------------------------------------------------------------
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

// --- wrangler helpers ---------------------------------------------------
function wrangler(args) {
  // --yes so the CF build auto-installs wrangler via npx without prompting.
  return execFileSync(npx, ["--yes", "wrangler", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}
const sql = (command) =>
  wrangler(["d1", "execute", DB, "--remote", "--json", "--command", command]);
const runFile = (file) =>
  wrangler(["d1", "execute", DB, "--remote", "--file", `${DIR}/${file}`]);

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

// First run against an already-initialized DB (schema created out-of-band,
// before this automation existed): ADOPT it — record the current migrations as
// applied WITHOUT re-running them (0001's CREATE TABLEs / the ALTERs would error
// on a re-run). Detected by an existing core table. A truly fresh DB has no
// `patients` table, so it falls through and runs every migration normally.
// NOTE: enable this automation BEFORE adding further migrations, so adoption
// only ever records migrations that are genuinely already applied.
if (applied.size === 0) {
  const initialized =
    rows(sql("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='patients' LIMIT 1")).length > 0;
  if (initialized) {
    for (const f of files) sql(`INSERT OR IGNORE INTO applied_migrations (name) VALUES ('${f}')`);
    console.log(`[migrate] adopted existing DB — recorded ${files.length} migration(s) as applied (no SQL re-run).`);
    process.exit(0);
  }
}

const pending = files.filter((f) => !applied.has(f));

if (pending.length === 0) {
  console.log(`[migrate] schema up to date (${files.length} migration(s) tracked).`);
  process.exit(0);
}

for (const f of pending) {
  console.log(`[migrate] applying ${f} …`);
  runFile(f);
  sql(`INSERT INTO applied_migrations (name) VALUES ('${f}')`);
  console.log(`[migrate] ✓ ${f}`);
}
console.log(`[migrate] applied ${pending.length} new migration(s).`);
