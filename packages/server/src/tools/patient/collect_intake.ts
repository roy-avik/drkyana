/**
 * collect_intake — client-rendered. The patient agent calls this ONCE after
 * detecting a booking/urgent intent; the receptionist UI then renders the
 * structured intake form (see INTAKE_FORM in @drkyana/types) and the patient
 * fills it in one go. The result returns via addToolResult and matches
 * submit_intake's input shape so it can be passed straight in — no slot-by-slot
 * Q&A from the agent, big cut in Claude calls.
 *
 * The tool has NO `execute`: it is the SDK signal that the client should render
 * UI; the server does no work here.
 */
import { z } from "zod";
import { defineTool } from "../../tools";

/**
 * `prefill` lets the agent open the form ALREADY populated from what the
 * patient said in chat. Keys match the intake field ids. Everything is
 * optional — pass only what the patient actually stated; never guess. `email`
 * is intentionally absent: the client fills the patient's VERIFIED email,
 * read-only, so the model can't set it.
 */
const prefillSchema = z
  .object({
    // NOTE: no `name`. The name is PII and the client fills it from the Patient
    // Object (you only ever have the PATIENT_NAME_TOKEN, never the real name).
    phone: z.string(),
    age: z.number().int().min(0).max(120),
    gender: z.enum(["female", "male", "other", "unspecified"]),
    affectedArea: z.string(),
    symptoms: z.array(z.string()),
    duration: z.string(),
    severity: z.number().int().min(0).max(10),
    triggers: z.array(z.string()),
    conditions: z.array(z.string()),
    allergies: z.array(z.string()),
    medications: z.array(z.string()),
    lastDentalVisit: z.string(),
    anxiety: z.enum(["none", "some", "high"]),
    preferredArea: z.string(),
    preferredDays: z.string(),
    timeOfDay: z.enum(["morning", "afternoon", "evening"]),
    urgency: z.enum(["routine", "soon", "urgent"]),
    payment: z.string(),
  })
  .partial();

const inputSchema = z.object({
  reason: z
    .enum(["booking", "urgent"])
    .describe("Why the form is being shown — informs the title/tone."),
  prefill: prefillSchema
    .optional()
    .describe(
      "Fields the patient ALREADY stated, to pre-populate the form. Map their " +
        "words to field ids (e.g. 'I need scaling for a lower tooth' → " +
        "{affectedArea:'lower tooth', symptoms:['scaling']}). Only include what " +
        "they actually said; omit the rest. Do NOT include name or email — the " +
        "client fills those itself.",
    ),
});

export const collectIntakeTool = defineTool({
  name: "collect_intake",
  description:
    "Open the structured intake form, PRE-FILLED with everything the patient " +
    "has already told you, for them to review and complete in ONE step. Use " +
    "this on the FIRST patient turn that indicates booking or an urgent " +
    "problem — do not ask slot-by-slot questions yourself, and always pass a " +
    "`prefill` with whatever they've stated so they aren't re-typing it. The " +
    "client renders the form and returns the full answers; you then submit.",
  category: "read",
  inputSchema,
  // No execute → client-rendered tool. The form result returns via the AI SDK
  // tool-result message from the client.
});
