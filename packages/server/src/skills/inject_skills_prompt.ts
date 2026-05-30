/**
 * Render the "Available skills:" block for an agent's SYSTEM prompt.
 *
 * Per the Vercel cookbook (https://ai-sdk.dev/cookbook/guides/agent-skills):
 * only metadata (name + description) is injected at boot — bodies stay out
 * of context until the agent calls `load_skill`. Preloaded skills are
 * EXCLUDED here since their bodies are concatenated directly into SYSTEM via
 * `preloadFor(audience)` (no point listing them as load-on-demand).
 *
 * If there are no load-on-demand skills for the audience, returns an empty
 * string — callers can safely concatenate the result unconditionally.
 */

import { manifestFor } from "./manifest";
import type { Audience } from "./types";

export function renderAvailableSkills(audience: Exclude<Audience, "both">): string {
  const onDemand = manifestFor(audience).filter((s) => !s.preload);
  if (onDemand.length === 0) return "";
  const lines = onDemand.map((s) => `- ${s.name}: ${s.description}`);
  return [
    "Available skills (call load_skill with the skill name to read the full body before you act on it):",
    ...lines,
  ].join("\n");
}
