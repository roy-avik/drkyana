/**
 * Agent factory contract. Three agents share this shape; Phase 1 implements
 * `runAgent`/`streamAgent` over AI SDK 6 (`streamText` / `generateText`).
 */
import {
  streamText,
  generateText,
  stepCountIs,
  type ModelMessage,
  type PrepareStepFunction,
} from "ai";
import { toAiSdkTools, type ToolRegistry } from "./tools";
import { modelFor } from "./models";
import type { AgentContext } from "./context";

/**
 * The system prompt as a cached message. Setting an Anthropic `ephemeral`
 * cache breakpoint on the system block caches the large static prefix (system
 * prompt + tool definitions, which precede it in the request) across turns —
 * big token-cost savings since only the conversation tail varies. The history
 * is intentionally NOT cached (it changes every turn).
 */
function cachedSystem(system: string): ModelMessage {
  return {
    role: "system",
    content: system,
    providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
  };
}

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
 * Build the AI SDK `prepareStep` callback from a spec's optional `escalate`.
 * On each step we consult `escalate(stepIndex, lastToolName)`; if it returns a
 * tier we swap the model for that step, otherwise the default tier is kept.
 */
function buildPrepareStep(
  spec: AgentSpec,
  ctx: AgentContext,
): PrepareStepFunction | undefined {
  if (!spec.escalate) return undefined;
  const escalate = spec.escalate.bind(spec);
  return ({ stepNumber, steps }) => {
    const lastStep = steps[steps.length - 1];
    const lastToolName = lastStep?.toolCalls?.[lastStep.toolCalls.length - 1]?.toolName;
    const tier = escalate(stepNumber, lastToolName);
    if (!tier) return {};
    return { model: modelFor(ctx.env, tier) };
  };
}

/**
 * Interactive agent (patient + admin chat) — returns a UI message stream
 * Response the client consumes via the AI SDK chat transport.
 */
export async function streamAgent(
  spec: AgentSpec,
  ctx: AgentContext,
  history: unknown[],
): Promise<Response> {
  const result = streamText({
    model: modelFor(ctx.env, spec.defaultTier),
    messages: [cachedSystem(spec.system), ...(history as ModelMessage[])],
    tools: toAiSdkTools(spec.tools, ctx),
    stopWhen: stepCountIs(spec.maxSteps),
    prepareStep: buildPrepareStep(spec, ctx),
    abortSignal: ctx.abortSignal,
  });
  return result.toUIMessageStreamResponse();
}

/**
 * Non-streamed agent (e.g. a radiology subagent inside a background job) —
 * runs the full tool loop and returns the final text.
 */
export async function runAgent(
  spec: AgentSpec,
  ctx: AgentContext,
  history: unknown[],
): Promise<{ text: string }> {
  const { text } = await generateText({
    model: modelFor(ctx.env, spec.defaultTier),
    messages: [cachedSystem(spec.system), ...(history as ModelMessage[])],
    tools: toAiSdkTools(spec.tools, ctx),
    stopWhen: stepCountIs(spec.maxSteps),
    prepareStep: buildPrepareStep(spec, ctx),
    abortSignal: ctx.abortSignal,
  });
  return { text };
}
