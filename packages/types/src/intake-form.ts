/**
 * Declarative patient intake form schema — the single structured form the
 * receptionist renders after detecting a booking/urgent intent (PR-C
 * "form-first" flow), instead of asking slot-by-slot. Field `id`s match
 * submit_intake's input keys exactly, so the collected values drop straight in.
 *
 * Labels are English defaults + an i18n `labelKey`; the client localizes via
 * t(labelKey, label) (EN/BN/FA), so a missing translation falls back to English.
 * This is structure/data only (no logic) — safe to share with both apps.
 */

export type IntakeFieldType =
  | "text"
  | "tel"
  | "email"
  | "number"
  | "select"
  | "tags" // free multi-value → string[]
  | "scale" // integer slider (min..max)
  | "textarea";

export interface IntakeFieldOption {
  value: string;
  label: string;
  labelKey: string;
}

export interface IntakeFormField {
  /** Matches the corresponding submit_intake input key. */
  id: string;
  type: IntakeFieldType;
  label: string;
  labelKey: string;
  required?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  options?: IntakeFieldOption[];
}

export interface IntakeFormGroup {
  id: string;
  title: string;
  titleKey: string;
  fields: IntakeFormField[];
}

const opt = (value: string, label: string): IntakeFieldOption => ({
  value,
  label,
  labelKey: `intake.option.${value}`,
});

/** The canonical intake form. Groups render top-to-bottom; `name` and `phone` are hard-required. */
export const INTAKE_FORM: IntakeFormGroup[] = [
  {
    id: "identity",
    title: "About you",
    titleKey: "intake.group.identity",
    fields: [
      { id: "name", type: "text", required: true, label: "Full name", labelKey: "intake.field.name" },
      { id: "phone", type: "tel", required: true, label: "Phone number", labelKey: "intake.field.phone" },
      { id: "email", type: "email", label: "Email (optional)", labelKey: "intake.field.email" },
      { id: "age", type: "number", min: 0, max: 120, label: "Age", labelKey: "intake.field.age" },
      {
        id: "gender",
        type: "select",
        label: "Gender",
        labelKey: "intake.field.gender",
        options: [opt("female", "Female"), opt("male", "Male"), opt("other", "Other"), opt("unspecified", "Prefer not to say")],
      },
    ],
  },
  {
    id: "complaint",
    title: "Your dental concern",
    titleKey: "intake.group.complaint",
    fields: [
      { id: "affectedArea", type: "text", label: "Which tooth or area?", labelKey: "intake.field.affectedArea" },
      { id: "symptoms", type: "tags", label: "Symptoms", labelKey: "intake.field.symptoms", placeholder: "e.g. pain, swelling, bleeding" },
      { id: "duration", type: "text", label: "How long has it been going on?", labelKey: "intake.field.duration" },
      { id: "severity", type: "scale", min: 0, max: 10, label: "Pain / severity (0–10)", labelKey: "intake.field.severity" },
      { id: "triggers", type: "tags", label: "What makes it worse?", labelKey: "intake.field.triggers", placeholder: "e.g. cold, chewing, sweets" },
    ],
  },
  {
    id: "medical",
    title: "Medical history",
    titleKey: "intake.group.medical",
    fields: [
      { id: "conditions", type: "tags", label: "Medical conditions", labelKey: "intake.field.conditions", placeholder: "e.g. diabetes, hypertension" },
      { id: "allergies", type: "tags", label: "Allergies", labelKey: "intake.field.allergies", placeholder: "e.g. penicillin" },
      { id: "medications", type: "tags", label: "Current medications", labelKey: "intake.field.medications" },
    ],
  },
  {
    id: "dental",
    title: "Dental history",
    titleKey: "intake.group.dental",
    fields: [
      { id: "lastDentalVisit", type: "text", label: "Last dental visit", labelKey: "intake.field.lastDentalVisit", placeholder: "e.g. 6 months ago, never" },
      {
        id: "anxiety",
        type: "select",
        label: "Dental anxiety",
        labelKey: "intake.field.anxiety",
        options: [opt("none", "None"), opt("some", "A little"), opt("high", "Very anxious")],
      },
    ],
  },
  {
    id: "logistics",
    title: "Booking preferences",
    titleKey: "intake.group.logistics",
    fields: [
      { id: "preferredArea", type: "text", label: "Preferred area in Dhaka", labelKey: "intake.field.preferredArea" },
      { id: "preferredDays", type: "text", label: "Preferred days", labelKey: "intake.field.preferredDays", placeholder: "e.g. weekends, Mon/Wed" },
      {
        id: "timeOfDay",
        type: "select",
        label: "Preferred time",
        labelKey: "intake.field.timeOfDay",
        options: [opt("morning", "Morning"), opt("afternoon", "Afternoon"), opt("evening", "Evening")],
      },
      {
        id: "urgency",
        type: "select",
        label: "How urgent is it?",
        labelKey: "intake.field.urgency",
        options: [opt("routine", "Routine"), opt("soon", "Soon"), opt("urgent", "Urgent")],
      },
      { id: "payment", type: "text", label: "Payment (optional)", labelKey: "intake.field.payment", placeholder: "self-pay / insurance" },
    ],
  },
];

/** Field ids whose value is a string[] (tags) — the rest are scalar. */
export const INTAKE_TAG_FIELDS: ReadonlySet<string> = new Set([
  "symptoms",
  "triggers",
  "conditions",
  "allergies",
  "medications",
]);

/**
 * Prefill payload the patient agent passes to `collect_intake` so the form
 * opens ALREADY populated with everything the patient said in chat — the
 * patient reviews + fills gaps instead of re-typing. Keys match field ids
 * (and submit_intake's input). All optional; `email` is intentionally omitted
 * (the verified email is filled by the client, never the model).
 */
export interface IntakePrefill {
  name?: string;
  phone?: string;
  age?: number;
  gender?: "female" | "male" | "other" | "unspecified";
  affectedArea?: string;
  symptoms?: string[];
  duration?: string;
  severity?: number;
  triggers?: string[];
  conditions?: string[];
  allergies?: string[];
  medications?: string[];
  lastDentalVisit?: string;
  anxiety?: "none" | "some" | "high";
  preferredArea?: string;
  preferredDays?: string;
  timeOfDay?: "morning" | "afternoon" | "evening";
  urgency?: "routine" | "soon" | "urgent";
  payment?: string;
}
