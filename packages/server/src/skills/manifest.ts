/**
 * Skill manifest — typed view over the build-generated bundle.
 *
 * Two reads: `manifestFor(audience)` filters by audience for the
 * "Available skills:" prompt block and the `load_skill` lookup; `preloadFor`
 * returns the bodies of `preload: true` skills, ready to concatenate into the
 * agent's SYSTEM string at construction.
 */

import { SKILL_FILES, SKILL_MANIFEST } from "./_generated";
import { audienceMatches, type Audience, type SkillEntry } from "./types";

/** All skills visible to an audience (`both`-audience skills count for every concrete audience). */
export function manifestFor(audience: Exclude<Audience, "both">): SkillEntry[] {
  return SKILL_MANIFEST.filter((s) => audienceMatches(s, audience));
}

/**
 * Bodies for preloaded skills visible to an audience, in stable name order.
 * Concatenate these into the agent's SYSTEM string — they bypass `load_skill`
 * because they are the always-on baseline (voice, hard rules, consent posture).
 */
export function preloadFor(audience: Exclude<Audience, "both">): string[] {
  return manifestFor(audience)
    .filter((s) => s.preload)
    .map((s) => SKILL_FILES[s.file] ?? "")
    .filter((body) => body.length > 0);
}

/** Look up a skill by `name`, scoped to an audience. Returns null if missing or out-of-audience. */
export function findSkill(
  audience: Exclude<Audience, "both">,
  name: string,
): SkillEntry | null {
  return manifestFor(audience).find((s) => s.name === name) ?? null;
}

/** Re-exports for callers that want the raw bundle (e.g. evals). */
export { SKILL_FILES, SKILL_MANIFEST };
