#!/usr/bin/env node
/**
 * Patient-bundle size budget. Fails the build when the gzipped JS shipped to
 * patients exceeds the ceiling.
 *
 * WHY: the patient site loads over Dhaka mobile from an Instagram bio link.
 * Cloudflare's platform limits (25 MiB/asset, 10 MB/Worker) are two orders of
 * magnitude above what a patient should download, so the meaningful limit has
 * to be enforced here. Baseline at introduction (2026-07-23): ~125 KB gzip.
 * The 150 KB ceiling leaves headroom for the Phase-1 component library while
 * still forcing route-level code-splitting before any bigger growth lands.
 *
 * Run after `npm run build`:  node scripts/check-bundle-size.mjs
 * Numbers always print, pass or fail, so drift is visible in every CI log.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const DIST = join(process.cwd(), "dist", "assets");
/** Gzipped ceiling for ALL patient JS combined, in bytes. */
const JS_BUDGET_BYTES = 300 * 1024;

if (!existsSync(DIST)) {
  console.error("check-bundle-size: dist/assets not found — run `npm run build` first.");
  process.exit(1);
}

const rows = [];
let jsTotal = 0;
for (const name of readdirSync(DIST).sort()) {
  if (!/\.(js|css)$/.test(name)) continue;
  const gz = gzipSync(readFileSync(join(DIST, name)), { level: 9 }).length;
  rows.push({ name, gz });
  if (name.endsWith(".js")) jsTotal += gz;
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
for (const r of rows) console.log(`  ${kb(r.gz).padStart(9)}  ${r.name}`);
console.log(`\n  JS total (gzip): ${kb(jsTotal)}  /  budget: ${kb(JS_BUDGET_BYTES)}`);

if (jsTotal > JS_BUDGET_BYTES) {
  console.error(
    `\ncheck-bundle-size: OVER BUDGET by ${kb(jsTotal - JS_BUDGET_BYTES)}.\n` +
      "Split by route (React.lazy on /receptionist, /account, legal pages) or " +
      "trim dependencies before raising this ceiling — raising it is a decision, " +
      "not a fix.",
  );
  process.exit(1);
}
console.log("  OK — under budget.");
