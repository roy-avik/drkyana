#!/usr/bin/env node
/**
 * bundle-skills — pre-build step that turns `.skills/<name>/SKILL.md` files
 * into a committed TS module the server package consumes at runtime.
 *
 * Why a pre-build script (not a Vite/esbuild plugin):
 *   `packages/server` is consumed by TWO different builds (the patient Pages
 *   Function via Cloudflare's esbuild, and the admin Next.js worker via
 *   OpenNext). A single Vite plugin wouldn't cover both. A prebuild script
 *   generating a TS file works across both consumers and keeps the source of
 *   truth in markdown.
 *
 * Outputs `packages/server/src/skills/_generated.ts` containing:
 *   - SKILL_FILES: Record<string, string>   // path -> file body (frontmatter stripped)
 *   - SKILL_MANIFEST: SkillEntry[]          // frontmatter + path + file
 *
 * Invariants enforced (build fails on violation):
 *   - Every SKILL.md must have valid frontmatter with required name + description
 *   - `name` must match its directory name (otherwise lookups break)
 *   - `audience` must be one of: patient | admin | both | coding-agent
 *   - `owner` must be one of: clinical | engineering
 *
 * Frontmatter parser is intentionally tiny — same conservative shape as
 * scripts/locales.py (one `key: value` per line, optional quoted strings,
 * booleans, integers). No nested keys, no anchors, no multi-line scalars.
 */

import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");
const SKILLS_DIR = join(REPO_ROOT, ".skills");
const OUT_DIR = join(REPO_ROOT, "packages", "server", "src", "skills");
const OUT_FILE = join(OUT_DIR, "_generated.ts");

const ALLOWED_AUDIENCE = new Set(["patient", "admin", "both", "coding-agent"]);
const ALLOWED_OWNER = new Set(["clinical", "engineering"]);

/** Parse `key: value` frontmatter between leading `---` fences. */
function parseFrontmatter(raw, filePath) {
  if (!raw.startsWith("---")) {
    throw new Error(`${filePath}: missing leading --- frontmatter fence`);
  }
  const rest = raw.slice(3).replace(/^\r?\n/, "");
  const end = rest.indexOf("\n---");
  if (end < 0) {
    throw new Error(`${filePath}: missing closing --- frontmatter fence`);
  }
  const block = rest.slice(0, end);
  const body = rest.slice(end + 4).replace(/^\r?\n/, "");
  const fm = {};
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx < 0) throw new Error(`${filePath}: unparseable frontmatter line: ${line}`);
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (val === "true") fm[key] = true;
    else if (val === "false") fm[key] = false;
    else if (/^-?\d+$/.test(val)) fm[key] = Number(val);
    else fm[key] = val;
  }
  return { frontmatter: fm, body };
}

function validate(fm, dirName, filePath) {
  if (typeof fm.name !== "string" || !fm.name)
    throw new Error(`${filePath}: required field 'name' missing`);
  if (typeof fm.description !== "string" || !fm.description)
    throw new Error(`${filePath}: required field 'description' missing`);
  if (fm.name !== dirName)
    throw new Error(
      `${filePath}: frontmatter name (${fm.name}) must match directory name (${dirName})`,
    );
  if (!ALLOWED_AUDIENCE.has(fm.audience))
    throw new Error(
      `${filePath}: audience must be one of ${[...ALLOWED_AUDIENCE].join(", ")} (got ${fm.audience})`,
    );
  if (!ALLOWED_OWNER.has(fm.owner))
    throw new Error(
      `${filePath}: owner must be one of ${[...ALLOWED_OWNER].join(", ")} (got ${fm.owner})`,
    );
  return {
    name: fm.name,
    description: fm.description,
    audience: fm.audience,
    owner: fm.owner,
    version: typeof fm.version === "number" ? fm.version : 1,
    preload: fm.preload === true,
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  /** @type {Array<{ path: string; file: string; body: string; frontmatter: ReturnType<typeof validate> }>} */
  const skills = [];

  if (existsSync(SKILLS_DIR)) {
    const dirs = await readdir(SKILLS_DIR, { withFileTypes: true });
    for (const dirent of dirs) {
      if (!dirent.isDirectory()) continue;
      const dirName = dirent.name;
      const skillDir = join(SKILLS_DIR, dirName);
      const filePath = join(skillDir, "SKILL.md");
      if (!existsSync(filePath)) continue;
      const raw = await readFile(filePath, "utf8");
      const { frontmatter, body } = parseFrontmatter(raw, filePath);
      const validated = validate(frontmatter, dirName, filePath);
      skills.push({
        path: relative(REPO_ROOT, skillDir).replaceAll("\\", "/"),
        file: relative(REPO_ROOT, filePath).replaceAll("\\", "/"),
        body,
        frontmatter: validated,
      });
    }
  }

  // Stable ordering for deterministic builds.
  skills.sort((a, b) => a.frontmatter.name.localeCompare(b.frontmatter.name));

  const filesEntries = skills
    .map((s) => `  ${JSON.stringify(s.file)}: ${JSON.stringify(s.body)},`)
    .join("\n");

  const manifestEntries = skills
    .map(
      (s) => `  {
    name: ${JSON.stringify(s.frontmatter.name)},
    description: ${JSON.stringify(s.frontmatter.description)},
    audience: ${JSON.stringify(s.frontmatter.audience)},
    owner: ${JSON.stringify(s.frontmatter.owner)},
    version: ${s.frontmatter.version},
    preload: ${s.frontmatter.preload},
    path: ${JSON.stringify(s.path)},
    file: ${JSON.stringify(s.file)},
  },`,
    )
    .join("\n");

  const out = `/**
 * GENERATED by scripts/bundle-skills.mjs. Do not edit by hand.
 *
 * Source: .skills/<name>/SKILL.md (frontmatter + markdown body).
 * Regenerate: npm run skills:bundle
 */
import type { SkillEntry } from "./types";

/** path -> SKILL.md body with frontmatter stripped */
export const SKILL_FILES: Record<string, string> = {
${filesEntries}
};

/** Frontmatter + discovery metadata for every bundled skill. */
export const SKILL_MANIFEST: readonly SkillEntry[] = [
${manifestEntries}
] as const;
`;

  await writeFile(OUT_FILE, out, "utf8");
  console.log(
    `[bundle-skills] wrote ${skills.length} skill(s) -> ${relative(REPO_ROOT, OUT_FILE)}`,
  );
}

main().catch((err) => {
  console.error("[bundle-skills] FAILED:", err.message);
  process.exit(1);
});
