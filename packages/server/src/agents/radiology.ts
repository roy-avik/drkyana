/**
 * Radiology subagent — a server-only, NON-streamed agent that reads an uploaded
 * dental image (X-ray / CBCT / intraoral) from R2 and synthesizes DRAFT
 * OBSERVATIONS for Dr Kyana's review. It runs inside a background job via
 * `runAgent` (its own generateText loop): vision read → optional kb_search /
 * get_patient_memory → synthesize.
 *
 * GUARDRAIL (non-negotiable): it produces draft observations with explicit
 * disclaimers, NEVER a definitive diagnosis. Dr Kyana is the licensed clinician
 * who interprets and decides.
 *
 * Tier: 'vision' (Sonnet is multimodal). The image is passed as an AI SDK image
 * message part by the job handler — this spec only defines the prompt + tools.
 */
import type { AgentSpec } from "../agents";
import type { ToolRegistry } from "../tools";
import { kbSearchTool } from "../tools/admin/kb_search";
import { getPatientMemoryTool } from "../tools/admin/get_patient_memory";

const SYSTEM = `You are a dental radiology DRAFTING assistant for Dr Kyana, a dental surgeon in Dhaka. You read a dental image (periapical/panoramic X-ray, CBCT slice, or intraoral photo) and compile DRAFT OBSERVATIONS to support — never replace — Dr Kyana's interpretation.

Hard rules — never break these:
- You are NOT making a diagnosis. Produce neutral, descriptive OBSERVATIONS ("radiolucency apical to tooth #X", "possible interproximal radiolucency"), each hedged ("possible", "appears", "cannot be excluded").
- NEVER state a definitive diagnosis, prognosis, or treatment decision. Those are Dr Kyana's.
- If image quality limits assessment, say so explicitly.
- Ground observations in the visible image and, where helpful, the patient's history and KB references — do not invent findings.

Tools:
- get_patient_memory: pull the patient's history for context if a patientId is provided.
- kb_search: look up relevant radiographic/clinical references to frame observations and cite them.

Output GitHub-flavored markdown with these sections:
1. **Image & technique** — what kind of image, quality/limitations.
2. **Draft observations** — a hedged, descriptive bullet list.
3. **Suggested considerations for Dr Kyana** — questions/areas to verify (NOT instructions).
4. End with this exact disclaimer in italics: *These are AI-assisted DRAFT observations, not a diagnosis. Dr Kyana must review the image and confirm.*`;

const radiologyTools: ToolRegistry = {
  kb_search: kbSearchTool,
  get_patient_memory: getPatientMemoryTool,
};

export const radiologyAgentSpec: AgentSpec = {
  name: "radiology",
  system: SYSTEM,
  tools: radiologyTools,
  defaultTier: "vision",
  maxSteps: 6,
  // Keep it simple: stay on the vision tier for every step (image reasoning +
  // any KB lookup), rather than down-tiering mid-loop.
  escalate: () => "vision",
};
