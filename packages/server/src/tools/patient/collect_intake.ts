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

const inputSchema = z.object({
  reason: z
    .enum(["booking", "urgent"])
    .describe("Why the form is being shown — informs the title/tone."),
});

export const collectIntakeTool = defineTool({
  name: "collect_intake",
  description:
    "Open the structured intake form for the patient to fill (identity, " +
    "complaint, medical & dental history, booking preferences) in ONE step. " +
    "Use this on the FIRST patient turn that indicates booking or an urgent " +
    "problem — do not ask slot-by-slot questions yourself. The client renders " +
    "the form and returns the structured answers; you then call run_triage " +
    "and submit_intake with those values.",
  category: "read",
  inputSchema,
  // No execute → client-rendered tool. The form result returns via the AI SDK
  // tool-result message from the client.
});
