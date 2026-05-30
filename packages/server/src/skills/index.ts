/**
 * Skills public surface — what agent specs and tool registries import.
 *
 * Pattern (Vercel AI SDK agent-skills cookbook):
 *   1. At agent construction:
 *        const preloaded = preloadFor(audience);
 *        const skillsList = renderAvailableSkills(audience);
 *        const SYSTEM = [core, ...preloaded, skillsList].filter(Boolean).join('\n\n');
 *   2. Add the tool: `load_skill: loadSkillToolFor(audience)` to the registry.
 *   3. The agent calls `load_skill({ name })` when it needs a load-on-demand
 *      skill; preloaded bodies are already in SYSTEM and never need a tool call.
 */

export { renderAvailableSkills } from "./inject_skills_prompt";
export { manifestFor, preloadFor, findSkill, SKILL_FILES, SKILL_MANIFEST } from "./manifest";
export { loadSkillToolFor, type LoadSkillResult } from "./load_skill_tool";
export { mapSandbox, type Sandbox } from "./sandbox";
export type { Audience, SkillEntry, SkillFrontmatter, SkillOwner } from "./types";
