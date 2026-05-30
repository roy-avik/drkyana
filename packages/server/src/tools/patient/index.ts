/**
 * Patient toolset — the small set of tools the patient agent may call. All are
 * server-only. Authorization for each is derived from the AgentContext (the
 * patient session), never from model-supplied args.
 */
import type { ToolRegistry } from "../../tools";
import { runTriageTool } from "./run_triage";
import { suggestChamberTool } from "./suggest_chamber";
import { lookupReturningPatientTool } from "./lookup_returning_patient";
import { submitIntakeTool } from "./submit_intake";
import { collectIntakeTool } from "./collect_intake";
import { emailVerificationTool } from "./email_verification";
import { loadSkillToolFor } from "../../skills";

export { runTriageTool, assessTriage } from "./run_triage";
export { suggestChamberTool } from "./suggest_chamber";
export { lookupReturningPatientTool } from "./lookup_returning_patient";
export { submitIntakeTool } from "./submit_intake";
export { collectIntakeTool } from "./collect_intake";
export { emailVerificationTool } from "./email_verification";

/** Registry keyed by the tool name the model sees. */
export const patientTools: ToolRegistry = {
  // Client-rendered: opens the structured intake form (form-first flow).
  collect_intake: collectIntakeTool,
  // Client-rendered: opens the email OTP step (plan item 1).
  email_verification: emailVerificationTool,
  // Server-executed:
  run_triage: runTriageTool,
  suggest_chamber: suggestChamberTool,
  lookup_returning_patient: lookupReturningPatientTool,
  submit_intake: submitIntakeTool,
  // Behavior skills: load on demand (audience-scoped).
  load_skill: loadSkillToolFor("patient"),
};
