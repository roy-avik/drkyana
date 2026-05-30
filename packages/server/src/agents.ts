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
  type UIMessage,
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
 * Options for `streamAgent` — opt-in chat persistence per AI SDK 6's
 * "persistence mode" on `toUIMessageStreamResponse`. When you pass
 * `originalMessages`, the SDK assigns a stable id to the response message and
 * fires `onFinish` with the FULL updated `messages` array (original + new
 * assistant turn, including tool calls). That is the moment to upsert the
 * session row in D1 — without it, the assistant turn lives only in the
 * client's `useChat` state and a reload loses it.
 */
export interface StreamAgentPersistenceOptions {
  /** The thread the client sent (stored ∪ incoming, already merged by the endpoint). */
  originalMessages: UIMessage[];
  /**
   * Fires once after the stream completes. `messages` is the updated thread
   * (`originalMessages` + the new assistant turn). Use `ctx.waitUntil` inside
   * to persist without blocking the response.
   */
  onFinish: (event: {
    messages: UIMessage[];
    isAborted: boolean;
  }) => void | Promise<void>;
}

/**
 * Interactive agent (patient + admin chat) — returns a UI message stream
 * Response the client consumes via the AI SDK chat transport.
 *
 * Pass `persistence` to upsert the full thread on stream completion. Without
 * it, the response is streamed but the assistant turn is never persisted on
 * the server — any reload that lands before the user's next message loses it.
 */
export async function streamAgent(
  spec: AgentSpec,
  ctx: AgentContext,
  history: unknown[],
  persistence?: StreamAgentPersistenceOptions,
): Promise<Response> {
  const result = streamText({
    model: modelFor(ctx.env, spec.defaultTier),
    messages: [cachedSystem(spec.system), ...(history as ModelMessage[])],
    tools: toAiSdkTools(spec.tools, ctx),
    stopWhen: stepCountIs(spec.maxSteps),
    prepareStep: buildPrepareStep(spec, ctx),
    abortSignal: ctx.abortSignal,
  });
  if (!persistence) return result.toUIMessageStreamResponse();
  return result.toUIMessageStreamResponse({
    originalMessages: persistence.originalMessages,
    onFinish: ({ messages, isAborted }) =>
      persistence.onFinish({ messages, isAborted }),
  });
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
