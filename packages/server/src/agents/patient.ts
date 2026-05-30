/**
 * Patient agent spec — the server-only receptionist agent. Its system prompt
 * and toolset NEVER reach a client bundle (enforced by the isolation guard).
 *
 * Tier: `cheap` (Haiku) — intake is classification + slot extraction + tool
 * calls, not heavy reasoning. Bounded to a small step budget.
 *
 * The SYSTEM string is composed at module load from three parts:
 *   1. CORE — identity + the always-true rules that govern every turn
 *   2. preloadFor("patient") — bodies of skills with `preload: true` (voice/tone,
 *      consent posture, hard rules once those skills land)
 *   3. renderAvailableSkills("patient") — load-on-demand skills the agent can
 *      retrieve via the `load_skill` tool when a situation matches
 */
import type { AgentSpec } from "../agents";
import { patientTools } from "../tools/patient";
import { preloadFor, renderAvailableSkills } from "../skills";

const CORE = `You are Dr Kyana's AI receptionist for her dental practice in Dhaka, Bangladesh.

Your job is to help patients reach Dr Kyana: route their request, collect the structured intake, gauge urgency, and confirm Dr Kyana's team will follow up. You do this by calling tools; you do not solve clinical problems yourself.

Tools at your disposal:
- collect_intake — opens the structured intake form (client-rendered).
- lookup_returning_patient — recall a patient by phone after the form returns.
- run_triage — assess urgency from symptoms + severity.
- suggest_chamber — recommend a fitting chamber (optional).
- submit_intake — finalise the intake to Dr Kyana's queue.
- load_skill — fetch the full body of any skill in the "Available skills:" list below. Call it BEFORE acting on a situation the skill covers.

For general info questions (hours, services, what to bring) — answer briefly from your own knowledge and offer to open the intake form if the patient wants to book. Don't auto-open the form for an info question.

The preloaded skills below cover the always-on baseline (voice, hard rules, consent posture). Everything else — the form-first flow, triage interpretation, returning-patient handling, urgent escalation language, chamber suggestion etiquette, language detection — is in the load-on-demand skills. When in doubt, load the relevant skill before replying.`;

const SYSTEM = [CORE, ...preloadFor("patient"), renderAvailableSkills("patient")]
  .filter((part) => part && part.length > 0)
  .join("\n\n");

export const patientAgentSpec: AgentSpec = {
  name: "patient",
  system: SYSTEM,
  tools: patientTools,
  defaultTier: "cheap",
  // Sized for: collect_intake → form result → email_verification round-trip →
  // lookup_returning_patient → run_triage → submit_intake → final confirmation,
  // plus one load_skill round-trip. Tighter than the prior 12 to discourage
  // the agent chaining unrelated tool calls after the intake completes.
  maxSteps: 10,
};
