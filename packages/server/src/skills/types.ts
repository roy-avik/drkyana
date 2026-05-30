/**
 * Skill types — Vercel AI SDK agent-skills pattern (cookbook guide:
 * https://ai-sdk.dev/cookbook/guides/agent-skills) adapted to this codebase.
 *
 * Two REQUIRED frontmatter fields per the guide (`name`, `description`).
 * Three LOCAL extensions used for routing + governance: `audience`, `owner`,
 * `preload`. `version` is also a local extension, bumped on body changes to
 * invalidate eval caches.
 *
 * Skills live in `.skills/<name>/SKILL.md` at repo root. The bundle script
 * (`scripts/bundle-skills.mjs`) generates `_generated.ts` in this directory at
 * prebuild — committed so reviewers see the diff and fresh clones don't need a
 * separate build step before typechecking.
 */

import { z } from "zod";

/** Who the skill is for; the manifest filter routes by this. */
export type Audience = "patient" | "admin" | "both" | "coding-agent";

/** PR-approval gate — CODEOWNERS or build-plugin-enforced on diff. */
export type SkillOwner = "clinical" | "engineering";

/** Frontmatter parsed from a SKILL.md file. */
export const skillFrontmatterSchema = z.object({
  /** REQUIRED (Vercel) — short identifier matching the directory name. */
  name: z.string().min(1),
  /**
   * REQUIRED (Vercel) — the agent reads this from the system prompt to decide
   * whether to call `load_skill`. Write it as a load-trigger, not a one-line
   * summary. The first sentence should answer "when do I load this?".
   */
  description: z.string().min(1),
  /** LOCAL — audience filter for `load_skill` and the "Available skills:" block. */
  audience: z.enum(["patient", "admin", "both", "coding-agent"]),
  /** LOCAL — CODEOWNERS gate. Clinical-owned skills require clinical sign-off. */
  owner: z.enum(["clinical", "engineering"]),
  /** LOCAL — bumped on body change for eval cache invalidation. */
  version: z.number().int().positive().default(1),
  /**
   * LOCAL — if true the body is concatenated into the agent's SYSTEM prompt at
   * boot (always-on baseline). Otherwise the body loads on demand via
   * `load_skill`. Use for irreducible cross-cutting rules: voice/tone, hard
   * rules, consent posture.
   */
  preload: z.boolean().default(false),
});

export type SkillFrontmatter = z.infer<typeof skillFrontmatterSchema>;

/** A skill in the generated manifest — frontmatter plus discovery metadata. */
export interface SkillEntry extends SkillFrontmatter {
  /**
   * Repo-relative directory path (e.g. ".skills/voice-and-tone"). Returned by
   * `load_skill` so the agent can resolve sibling assets via other tools if a
   * skill bundles them.
   */
  path: string;
  /** Repo-relative path to the SKILL.md file itself. The map key in the sandbox. */
  file: string;
}

/** Audience match — `both` matches every concrete audience. */
export function audienceMatches(
  entry: SkillEntry,
  audience: Exclude<Audience, "both">,
): boolean {
  return entry.audience === audience || entry.audience === "both";
}
