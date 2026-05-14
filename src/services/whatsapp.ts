// Build the WhatsApp deeplink for the receptionist handoff.
//
// Dr Kyana reads English and Farsi but not Bengali, so every outgoing message
// goes out in English with the structured intent baked in. If the patient
// wrote in Bengali or another script, we include their raw note as a quoted
// block at the bottom so she has full context and can paste into Translate if
// needed.

import { WHATSAPP_LINK } from '../components/Contact';
import { BOOKING_SLOTS, type IntentId } from './intents';

export type BookingSlots = {
  visit_type?: string;
  preferred_time?: string;
  name?: string;
  note?: string;
};

const VISIT_TYPE_EN: Record<string, string> = Object.fromEntries(
  BOOKING_SLOTS[0].options!.map((o) => [o.id, o.en]),
);
const TIME_EN: Record<string, string> = Object.fromEntries(
  BOOKING_SLOTS[1].options!.map((o) => [o.id, o.en]),
);

export function buildWhatsAppHref(
  intent: IntentId,
  rawPatientText: string,
  slots?: BookingSlots,
): string {
  const message = buildMessage(intent, rawPatientText, slots ?? {});
  return `${WHATSAPP_LINK}?text=${encodeURIComponent(message)}`;
}

function buildMessage(intent: IntentId, raw: string, slots: BookingSlots): string {
  const lines: string[] = ['Hello Dr Kyana,'];

  switch (intent) {
    case 'book_appointment':
      lines.push('A patient would like to book an appointment.');
      if (slots.visit_type) lines.push(`Visit type: ${VISIT_TYPE_EN[slots.visit_type] ?? slots.visit_type}`);
      if (slots.preferred_time) lines.push(`Preferred time: ${TIME_EN[slots.preferred_time] ?? slots.preferred_time}`);
      if (slots.name) lines.push(`Name: ${slots.name}`);
      if (slots.note) lines.push(`Note: ${slots.note}`);
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
      lines.push('A patient sent a message I could not categorise. Their note is below.');
      break;
  }

  const trimmed = raw.trim().slice(0, 500);
  if (trimmed) {
    lines.push('');
    lines.push(`Their message: "${trimmed}"`);
  }
  lines.push('');
  lines.push('— Sent from your AI receptionist on drkyana.github.io');
  return lines.join('\n');
}
