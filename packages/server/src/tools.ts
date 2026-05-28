/**
 * Tool contract — the ONLY gateway through which the model touches server data.
 *
 * Design rules (frozen for Phase 1):
 *  - The model emits a tool call with args; `parse()` validates them (Zod in
 *    Phase 1); `execute()` runs server-side with the AgentContext.
 *  - `category` classifies side effects. `write`/`external` tools set
 *    `needsApproval: true` so AI SDK 6 pauses the loop for Dr Kyana's
 *    approve/edit before executing ("agent drafts, dentist sends").
 *  - Tools return COMPACT results — they re-enter the model context each step,
 *    so don't leak unneeded PHI or bloat tokens.
 *
 * Phase 1 binds this to AI SDK 6 via `toAiSdkTools()` (see stub below), turning
 * each ToolSpec into `tool({ description, inputSchema, needsApproval, execute })`.
 */
import type { AgentContext } from "./context";

export type ToolCategory = "read" | "write" | "external";

export interface ToolSpec<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  category: ToolCategory;
  /** write/external default to requiring human approval; reads never do. */
  needsApproval?: boolean;
  /** Validate + coerce model-supplied input. Phase 1: back this with a Zod schema. */
  parse(input: unknown): TArgs;
  /** Server-side effect. Authorize via ctx (NOT via args). Keep result compact. */
  execute(args: TArgs, ctx: AgentContext): Promise<TResult>;
}

/** Identity helper for type inference when declaring a tool. */
export function defineTool<TArgs, TResult>(
  spec: ToolSpec<TArgs, TResult>,
): ToolSpec<TArgs, TResult> {
  // Default: writes and external actions require approval unless explicitly opted out.
  if (spec.needsApproval === undefined) {
    spec.needsApproval = spec.category !== "read";
  }
  return spec;
}

export type ToolRegistry = Record<string, ToolSpec>;

/**
 * Phase 1 stub — converts a ToolRegistry into the AI SDK 6 `tools` map bound to
 * a request context. Left unimplemented here to keep Phase 0 dependency-free.
 *
 *   import { tool } from "ai";
 *   export function toAiSdkTools(registry, ctx) {
 *     return Object.fromEntries(Object.entries(registry).map(([k, t]) => [k, tool({
 *       description: t.description,
 *       inputSchema: t.zodSchema,            // Phase 1: ToolSpec carries a Zod schema
 *       needsApproval: t.needsApproval,
 *       execute: (raw) => t.execute(t.parse(raw), ctx),
 *     })]));
 *   }
 */
export declare function toAiSdkTools(registry: ToolRegistry, ctx: AgentContext): unknown;
