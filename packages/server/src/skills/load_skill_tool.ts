/**
 * load_skill — the tool the agent calls to fetch a skill's full body on demand.
 *
 * Per the Vercel cookbook agent-skills pattern: returns `{ path, body }`. The
 * `path` is the skill's directory (for resolving sibling assets via other
 * tools, if a skill ever bundles `assets/` or `references/`); the `body` is
 * the markdown content with frontmatter stripped.
 *
 * The tool is constructed PER AGENT with its audience baked in. A patient
 * session physically cannot pull an admin-audience skill body — the audience
 * filter happens in `findSkill` before the sandbox read.
 *
 * Category 'read', no approval gate: it's bundle-internal retrieval, not
 * external data fetch.
 */

import { z } from "zod";
import { defineTool, type ToolSpec } from "../tools";
import type { AgentContext } from "../context";
import { findSkill, manifestFor, SKILL_FILES } from "./manifest";
import { mapSandbox, type Sandbox } from "./sandbox";
import type { Audience } from "./types";

const inputSchema = z.object({
  name: z
    .string()
    .min(1)
    .describe("The exact `name` of a skill listed in 'Available skills:' in the system prompt."),
});

export interface LoadSkillResult {
  /** Repo-relative directory of the skill (e.g. ".skills/triage"). */
  path: string;
  /** SKILL.md body with YAML frontmatter stripped. */
  body: string;
}

/** Default sandbox for production: backed by the build-generated file map. */
const DEFAULT_SANDBOX: Sandbox = mapSandbox(SKILL_FILES);

/**
 * Build a `load_skill` tool spec scoped to a single audience.
 *
 * The sandbox is injected so tests can swap in a mock. Production code calls
 * this with `audience` only and the default sandbox is used.
 */
export function loadSkillToolFor(
  audience: Exclude<Audience, "both">,
  sandbox: Sandbox = DEFAULT_SANDBOX,
): ToolSpec<{ name: string }, LoadSkillResult> {
  const available = manifestFor(audience)
    .filter((s) => !s.preload)
    .map((s) => s.name);

  return defineTool<{ name: string }, LoadSkillResult>({
    name: "load_skill",
    description:
      "Load the full body of one skill from the 'Available skills:' list in your system prompt. " +
      "Call this BEFORE acting on a situation the skill covers, then follow what its body says. " +
      `Valid skill names for this agent: ${available.join(", ") || "(none)"}.`,
    category: "read",
    inputSchema,
    async execute(args, _ctx: AgentContext): Promise<LoadSkillResult> {
      const entry = findSkill(audience, args.name);
      if (!entry) {
        throw new Error(
          `load_skill: no skill named "${args.name}" for audience "${audience}". ` +
            `Valid names: ${available.join(", ") || "(none)"}.`,
        );
      }
      if (entry.preload) {
        // Preloaded skills are already in SYSTEM — loading them via tool wastes
        // a step. Return the body anyway so the agent isn't blocked, but the
        // tool description discourages this path.
      }
      const body = await sandbox.readFile(entry.file);
      return { path: entry.path, body };
    },
  });
}
