import type { IntentId } from './intents';
import type { TriageResult } from './triage';

export type IntakeData = {
  intent: IntentId;
  rawPatientText: string;
  collected: Record<string, string | string[]>;
  triage?: TriageResult;
};

const WEBHOOK_URL = import.meta.env.VITE_SHEETS_WEBHOOK_URL as string | undefined;
const WEBHOOK_TOKEN = import.meta.env.VITE_SHEETS_TOKEN as string | undefined;

export async function logIntake(data: IntakeData, locale: string): Promise<boolean> {
  if (!WEBHOOK_URL || !WEBHOOK_TOKEN) return false;

  const { intent, rawPatientText, collected, triage } = data;

  const patient = {
    phone: String(collected.phone ?? ''),
    email: String(collected.email ?? ''),
    name: collected.full_name ?? '',
    age: collected.age_range ?? '',
    gender: collected.gender ?? '',
    conditions: arrJoin(collected.conditions),
    allergies: arrJoin(collected.allergies),
    medications: collected.medications ?? '',
    lastVisit: collected.last_visit ?? '',
    anxiety: collected.anxiety ?? '',
    locale,
  };

  const intake = {
    intent,
    triageLevel: triage?.level ?? '',
    affectedArea: collected.affected_area ?? '',
    symptoms: collected.symptoms,
    duration: collected.duration ?? '',
    severity: collected.severity ?? '',
    triggers: collected.triggers,
    preferredArea: collected.preferred_area ?? '',
    preferredDays: collected.preferred_days,
    timeOfDay: collected.time_of_day ?? '',
    urgency: collected.urgency ?? '',
    payment: collected.payment ?? '',
    suggestedChamber: '',
    rawMessage: rawPatientText.slice(0, 500),
  };

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ token: WEBHOOK_TOKEN, patient, intake }),
      keepalive: true,
    });
    return true;
  } catch {
    return false;
  }
}

function arrJoin(v: unknown): string {
  if (!v) return '';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}
