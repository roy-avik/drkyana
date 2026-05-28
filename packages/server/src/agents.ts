/**
 * Agent factory contract. Three agents share this shape; Phase 1 implements
 * `runAgent`/`streamAgent` over AI SDK 6 (`Agent` / `streamText` / `generateText`).
 */
import type { ToolRegistry } from "./tools";
import type { AgentContext } from "./context";

/** Logical model tiers — mapped to concrete Claude model IDs in Phase 1 config. */
export type ModelTier = "cheap" | "standard" | "vision";

export interface AgentSpec {
  name: "patient" | "admin" | "radiology";
  /** Server-only system prompt. NEVER ship to a client bundle. */
  system: string;
  tools: ToolRegistry;
  defaultTier: ModelTier;
  /** Bound to AI SDK `stopWhen: stepCountIs(maxSteps)`. */
  maxSteps: number;
  /**
   * Optional per-step escalation — Phase 1 wires this to AI SDK `prepareStep`
   * (e.g. radiology reasoning step → "vision"/"standard", cheap steps → "cheap").
   */
  escalate?(stepIndex: number, lastToolName?: string): ModelTier | undefined;
}

/**
 * Phase 1 signatures (implemented over AI SDK 6):
 *
 *   // interactive (patient + admin chat) — returns a UI message stream Response
 *   export function streamAgent(spec: AgentSpec, ctx: AgentContext, history: unknown[]): Promise<Response>;
 *
 *   // non-streamed (radiology subagent inside a background job) — returns final result
 *   export function runAgent(spec: AgentSpec, ctx: AgentContext, history: unknown[]): Promise<{ text: string }>;
 */
export declare function streamAgent(
  spec: AgentSpec,
  ctx: AgentContext,
  history: unknown[],
): Promise<Response>;

export declare function runAgent(
  spec: AgentSpec,
  ctx: AgentContext,
  history: unknown[],
): Promise<{ text: string }>;
