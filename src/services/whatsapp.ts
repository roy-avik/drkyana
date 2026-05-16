// Build the WhatsApp deeplink for the receptionist handoff.
//
// The new intake system collects structured data across 5 groups. The
// WhatsApp message is PHI-minimized: medical details (conditions, allergies,
// medications) go to the Google Sheet only. WhatsApp carries identity,
// complaint, logistics, and a flag pointing Dr Kyana to the Sheet for
// sensitive health info.
//
// Dr Kyana reads English and Farsi but not Bengali, so every outgoing
// message goes out in English.

import { WHATSAPP_LINK } from '../components/Contact';
import { VISIT_TYPE_OPTIONS, type SlotOption } from './intakeSchema';
import type { IntentId } from './intents';
import type { TriageResult } from './triage';

export type IntakeData = {
  intent: IntentId;
  rawPatientText: string;
  collected: Record<string, string | string[]>;
  triage?: TriageResult;
};

// Keep the old signature working for non-booking intents (backwards compat)
export type BookingSlots = {
  visit_type?: string;
  preferred_time?: string;
  name?: string;
  note?: string;
};

const VISIT_TYPE_EN: Record<string, string> = Object.fromEntries(
  VISIT_TYPE_OPTIONS.map((o: SlotOption) => [o.id, o.en]),
);

export function buildWhatsAppHref(data: IntakeData): string {
  const message = buildMessage(data);
  return `${WHATSAPP_LINK}?text=${encodeURIComponent(message)}`;
}

const PHI_FIELDS = new Set(['conditions', 'allergies', 'medications', 'last_visit', 'anxiety']);

function buildMessage(data: IntakeData): string {
  const { intent, rawPatientText, collected, triage } = data;
  const lines: string[] = ['Hello Dr Kyana,'];

  // Header with triage level
  if (triage) {
    lines.push(`\nNEW PATIENT INTAKE — Priority: ${triage.level} (${triage.label.en})`);
  } else {
    lines.push('');
    switch (intent) {
      case 'book_appointment':
        lines.push('A patient would like to book an appointment.');
        break;
      case 'reschedule':
        lines.push('A patient would like to reschedule or cancel an existing appointment.');
        break;
      case 'urgent':
        lines.push('A patient says they have an urgent dental issue.');
        break;
      case 'ask_hours':
        lines.push('A patient is asking about your availability and hours.');
        break;
      case 'ask_location':
        lines.push('A patient is asking which chamber you see them at.');
        break;
      case 'ask_services':
        lines.push('A patient is asking about the treatments you offer.');
        break;
      case 'ask_pricing':
        lines.push('A patient is asking about pricing.');
        break;
      case 'ask_insurance':
        lines.push('A patient is asking about payment / insurance.');
        break;
      case 'greeting':
        lines.push('A patient said hello.');
        break;
      case 'other':
      default:
        lines.push('A patient sent a message I could not categorise.');
        break;
    }
  }

  // Structured fields (skip PHI)
  const hasCollected = Object.keys(collected).length > 0;
  if (hasCollected) {
    // Patient section
    const name = collected.full_name;
    const phone = collected.phone;
    const email = collected.email;
    const age = collected.age_range;
    const gender = collected.gender;
    if (name || phone || age || gender) {
      lines.push('\nPATIENT');
      const parts: string[] = [];
      if (name) parts.push(`Name: ${name}`);
      if (phone) parts.push(`Phone: ${phone}`);
      if (email) parts.push(`Email: ${email}`);
      lines.push(`  ${parts.join(' | ')}`);
      const demoParts: string[] = [];
      if (age) demoParts.push(`Age: ${age}`);
      if (gender) demoParts.push(String(gender));
      if (demoParts.length > 0) lines.push(`  ${demoParts.join(', ')}`);
    }

    // Complaint section
    const visitType = collected.visit_type;
    const area = collected.affected_area;
    const symptoms = collected.symptoms;
    const duration = collected.duration;
    const severity = collected.severity;
    const triggers = collected.triggers;
    if (visitType || area || symptoms || severity) {
      lines.push('\nCOMPLAINT');
      const complaintParts: string[] = [];
      if (area) complaintParts.push(String(area).replace(/_/g, ' '));
      if (visitType) complaintParts.push(VISIT_TYPE_EN[String(visitType)] ?? String(visitType));
      if (symptoms) {
        const s = Array.isArray(symptoms) ? symptoms.join(', ') : symptoms;
        complaintParts.push(s);
      }
      lines.push(`  ${complaintParts.join(' — ')}`);
      const detailParts: string[] = [];
      if (duration) detailParts.push(`Duration: ${String(duration).replace(/_/g, ' ')}`);
      if (severity) detailParts.push(`Severity: ${severity}/10`);
      if (detailParts.length > 0) lines.push(`  ${detailParts.join(' | ')}`);
      if (triggers) {
        const t = Array.isArray(triggers) ? triggers.join(', ') : triggers;
        if (t && t !== 'none') lines.push(`  Triggers: ${t}`);
      }
    }

    // PHI flag — medical details go to sheet only
    const hasPhi = Object.keys(collected).some((k) => PHI_FIELDS.has(k) && collected[k]);
    if (hasPhi) {
      lines.push('\n⚕ Has medical history on file — check intake sheet');
    }

    // Logistics section
    const preferredArea = collected.preferred_area;
    const days = collected.preferred_days;
    const timeOfDay = collected.time_of_day;
    const urgency = collected.urgency;
    const payment = collected.payment;
    if (preferredArea || days || urgency) {
      lines.push('\nLOGISTICS');
      const logParts: string[] = [];
      if (preferredArea) logParts.push(`Area: ${preferredArea}`);
      if (days) {
        const d = Array.isArray(days) ? days.join(', ') : days;
        logParts.push(`Days: ${d}`);
      }
      if (timeOfDay) logParts.push(String(timeOfDay));
      lines.push(`  ${logParts.join(' | ')}`);
      const extraParts: string[] = [];
      if (urgency) extraParts.push(`Urgency: ${String(urgency).replace(/_/g, ' ')}`);
      if (payment) extraParts.push(`Payment: ${String(payment).replace(/_/g, ' ')}`);
      if (extraParts.length > 0) lines.push(`  ${extraParts.join(' | ')}`);
    }
  }

  // Raw patient text (always include)
  const trimmed = rawPatientText.trim().slice(0, 500);
  if (trimmed) {
    lines.push('');
    lines.push(`Their message: "${trimmed}"`);
  }

  lines.push('');
  lines.push('— AI receptionist · drkyana.github.io');
  return lines.join('\n');
}
