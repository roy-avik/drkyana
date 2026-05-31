/**
 * Admin toolset — the full set of tools the admin agent may call. All are
 * server-only and call `assertAdmin(ctx)`; authorization is derived from the
 * verified Cloudflare Access JWT in the context, never from model args.
 *
 * Categories / approval:
 *  - read    (no gate): list_intakes, get_intake, get_patient_memory, kb_search,
 *                       and the draft_* tools (they only PRODUCE text).
 *  - write   (needsApproval): update_status, upsert_chamber, update_patient_memory.
 *  - external(needsApproval): send_receptionist_email.
 *  - external(no gate, async dispatch): start_radiology_analysis, compile_pdf
 *    (they only START a job whose OUTPUT is a draft; the send/finalize gate is
 *    downstream).
 */
import type { ToolRegistry } from "../../tools";

import { listIntakesTool } from "./list_intakes";
import { getIntakeTool } from "./get_intake";
import { getPatientMemoryTool } from "./get_patient_memory";
import { kbSearchTool } from "./kb_search";
import { draftAftercareTool } from "./draft_aftercare";
import { draftClinicalNoteTool } from "./draft_clinical_note";
import { draftReferralTool } from "./draft_referral";
import { draftCertificateTool } from "./draft_certificate";
import { draftFollowupTool } from "./draft_followup";
import { updateStatusTool } from "./update_status";
import { upsertChamberTool } from "./upsert_chamber";
import { updatePatientMemoryTool } from "./update_patient_memory";
import { sendReceptionistEmailTool } from "./send_receptionist_email";
import { startRadiologyAnalysisTool } from "./start_radiology_analysis";
import { compilePdfTool } from "./compile_pdf";
import { createAppointmentTool } from "./create_appointment";
import { getAppointmentTool } from "./get_appointment";
import { listAppointmentsTool } from "./list_appointments";
import { rescheduleAppointmentTool } from "./reschedule_appointment";
import { setAppointmentStatusTool } from "./set_appointment_status";
import { listPatientTranscriptsTool } from "./list_patient_transcripts";
import { getTranscriptTool } from "./get_transcript";
import { webSearchTool } from "./web_search";
import { webFetchTool } from "./web_fetch";
import { differentialDiagnosisTool } from "./differential_diagnosis";
import { scheduleAgentRunTool } from "./schedule_agent_run";
import { loadSkillToolFor } from "../../skills";

export { listIntakesTool } from "./list_intakes";
export { getIntakeTool } from "./get_intake";
export { getPatientMemoryTool } from "./get_patient_memory";
export { kbSearchTool } from "./kb_search";
export { draftAftercareTool } from "./draft_aftercare";
export { draftClinicalNoteTool } from "./draft_clinical_note";
export { draftReferralTool } from "./draft_referral";
export { draftCertificateTool } from "./draft_certificate";
export { draftFollowupTool } from "./draft_followup";
export { updateStatusTool } from "./update_status";
export { upsertChamberTool } from "./upsert_chamber";
export { updatePatientMemoryTool } from "./update_patient_memory";
export { sendReceptionistEmailTool } from "./send_receptionist_email";
export { startRadiologyAnalysisTool } from "./start_radiology_analysis";
export { compilePdfTool } from "./compile_pdf";
export { createAppointmentTool } from "./create_appointment";
export { getAppointmentTool } from "./get_appointment";
export { listAppointmentsTool } from "./list_appointments";
export { rescheduleAppointmentTool } from "./reschedule_appointment";
export { setAppointmentStatusTool } from "./set_appointment_status";
export { listPatientTranscriptsTool } from "./list_patient_transcripts";
export { getTranscriptTool } from "./get_transcript";
export { webSearchTool } from "./web_search";
export { webFetchTool } from "./web_fetch";
export { differentialDiagnosisTool } from "./differential_diagnosis";
export { scheduleAgentRunTool } from "./schedule_agent_run";

/** Registry keyed by the tool name the model sees. */
export const adminTools: ToolRegistry = {
  // reads
  list_intakes: listIntakesTool,
  get_intake: getIntakeTool,
  get_patient_memory: getPatientMemoryTool,
  kb_search: kbSearchTool,
  // drafting (read — text only)
  draft_aftercare: draftAftercareTool,
  draft_clinical_note: draftClinicalNoteTool,
  draft_referral: draftReferralTool,
  draft_certificate: draftCertificateTool,
  draft_followup: draftFollowupTool,
  // writes (needsApproval)
  update_status: updateStatusTool,
  upsert_chamber: upsertChamberTool,
  update_patient_memory: updatePatientMemoryTool,
  // external (needsApproval)
  send_receptionist_email: sendReceptionistEmailTool,
  // background dispatch (return a jobId fast)
  start_radiology_analysis: startRadiologyAnalysisTool,
  compile_pdf: compilePdfTool,
  // scheduling reads
  list_appointments: listAppointmentsTool,
  get_appointment: getAppointmentTool,
  // scheduling writes (needsApproval)
  create_appointment: createAppointmentTool,
  reschedule_appointment: rescheduleAppointmentTool,
  set_appointment_status: setAppointmentStatusTool,
  // transcripts (read)
  list_patient_transcripts: listPatientTranscriptsTool,
  get_transcript: getTranscriptTool,
  // live web (read — fail-soft when TAVILY_API_KEY unset)
  web_search: webSearchTool,
  web_fetch: webFetchTool,
  // clinical reasoning (write — approval-gated; persists provenance + supersede flow)
  differential_diagnosis: differentialDiagnosisTool,
  // deep research (read — runs inference over practice data; persists cost)
  schedule_agent_run: scheduleAgentRunTool,
  // behavior skills (load on demand, audience-scoped)
  load_skill: loadSkillToolFor("admin"),
};
