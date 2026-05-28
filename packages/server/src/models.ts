/**
 * Model configuration — maps logical {@link ModelTier}s to concrete Claude
 * model IDs and builds an AI SDK `LanguageModel` bound to the request's API key.
 *
 * NOTE: the model IDs below are the current Claude generation as of writing.
 * They may need updating as Anthropic ships new models — keep them centralized
 * here so a single edit re-tiers every agent. Verify against
 * `AnthropicMessagesModelId` in `@ai-sdk/anthropic` after upgrades.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import type { Env } from "./bindings";
import type { ModelTier } from "./agents";

/**
 * Concrete Claude model IDs per tier.
 *  - `cheap`: fast/low-cost — intake slot-filling, routing, summaries (Haiku).
 *  - `standard`: balanced reasoning + tool use for patient/admin chat (Sonnet).
 *  - `vision`: multimodal — radiology image reasoning (Sonnet is multimodal).
 */
export const MODEL_IDS: Record<ModelTier, string> = {
  cheap: "claude-haiku-4-5",
  standard: "claude-sonnet-4-6",
  vision: "claude-sonnet-4-6",
};

/** Build an AI SDK language model for the given tier using the env API key. */
export function modelFor(env: Env, tier: ModelTier): LanguageModel {
  const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return anthropic(MODEL_IDS[tier]);
}
