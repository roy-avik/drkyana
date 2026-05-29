/**
 * Tool contract — the ONLY gateway through which the model touches server data.
 *
 * Design rules (frozen for Phase 1):
 *  - The model emits a tool call with args; the AI SDK validates them against
 *    the tool's `inputSchema` (a Zod schema) before `execute()` ever runs, so
 *    `execute()` receives already-parsed, typed args.
 *  - `category` classifies side effects. `write`/`external` tools set
 *    `needsApproval: true` so AI SDK 6 pauses the loop for Dr Kyana's
 *    approve/edit before executing ("agent drafts, dentist sends").
 *  - Tools return COMPACT results — they re-enter the model context each step,
 *    so don't leak unneeded PHI or bloat tokens.
 *
 * Phase 1 binds this to AI SDK 6 via `toAiSdkTools()`, turning each ToolSpec
 * into `tool({ description, inputSchema, needsApproval, execute })`.
 */
import { tool, type ToolSet } from "ai";
import type { z } from "zod";
import type { AgentContext } from "./context";

export type ToolCategory = "read" | "write" | "external";

export interface ToolSpec<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  category: ToolCategory;
  /** write/external default to requiring human approval; reads never do. */
  needsApproval?: boolean;
  /**
   * Zod schema for the model-supplied input. Used directly as the AI SDK
   * `inputSchema`, so the SDK validates + types the args before `execute` runs.
   */
  inputSchema: z.ZodType<TArgs>;
  /**
   * Server-side effect. Authorize via ctx (NOT via args). Keep result compact.
   * Omit `execute` to mark the tool as CLIENT-RENDERED — the AI SDK pauses, the
   * client renders UI for it, and the result returns via addToolResult. Used
   * for the form-first patient intake (collect_intake).
   */
  execute?(args: TArgs, ctx: AgentContext): Promise<TResult>;
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
 * Convert a ToolRegistry into the AI SDK 6 `tools` map bound to a request
 * context. Each ToolSpec becomes an AI SDK `tool()`; the SDK parses model input
 * against `inputSchema` and only then calls `execute(args, ctx)`.
 */
export function toAiSdkTools(registry: ToolRegistry, ctx: AgentContext): ToolSet {
  const entries = Object.entries(registry).map(([key, spec]) => {
    const execute = spec.execute;
    const common = {
      description: spec.description,
      inputSchema: spec.inputSchema,
      needsApproval: spec.needsApproval ?? spec.category !== "read",
    };
    // Two explicit branches so TS picks the right `tool()` overload:
    // with `execute` (server-executed) vs without (client-rendered).
    const t = execute
      ? tool({ ...common, execute: (args: unknown) => execute(args, ctx) })
      : tool(common);
    return [key, t];
  });
  return Object.fromEntries(entries) as ToolSet;
}
