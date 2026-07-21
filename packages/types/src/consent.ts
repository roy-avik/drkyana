/**
 * Consent contract — shared between the patient client (which renders the
 * notice) and the server (which records what was agreed to).
 *
 * Bangladesh's PDPA 2026 requires explicit consent for sensitive personal data,
 * and every receptionist message is sent to Anthropic for inference. A single
 * blanket "I agree" does not hold up: each purpose is consented to separately
 * and can be withdrawn separately.
 *
 * Types and constants only — no logic, no prompts (see the package header).
 */

/**
 * What a patient can consent to. Each is recorded as its own `consents` row so
 * withdrawal is per-purpose.
 *
 * - `care`            — storing the medical record in D1 at all.
 * - `ai_inference`    — sending conversation content to Anthropic. Withdrawing
 *                       this must stop the receptionist, not merely log a row.
 * - `email`           — transactional email to the patient.
 * - `mcp_third_party` — reaching the record through a third-party agent host
 *                       (Claude, ChatGPT). Cross-border, so it names the host
 *                       and is never implied by `ai_inference`.
 */
export type ConsentScope = "care" | "ai_inference" | "email" | "mcp_third_party";

/** Scopes captured at verification. `mcp_third_party` is opt-in later. */
export const CONSENT_SCOPES_AT_VERIFY: readonly ConsentScope[] = [
  "care",
  "ai_inference",
  "email",
] as const;

/**
 * Bump whenever the consent wording changes in any locale. Recorded on every
 * row, so "which text did this patient agree to" is answerable after an edit.
 * Date-based because that is how a regulator will ask the question.
 */
export const CONSENT_POLICY_VERSION = "2026-07-22";

export interface ConsentRow {
  id: string;
  patient_id?: string | null;
  session_id: string;
  email: string;
  scope: ConsentScope;
  policy_version: string;
  /** SHA-256 of the canonical (English) consent text for this version+scope. */
  text_sha256: string;
  locale: string;
  ip_hash?: string | null;
  granted_at: number;
  /** NULL while the consent is in force. */
  withdrawn_at?: number | null;
}

/** Current consent state for one identity, as the patient UI displays it. */
export interface ConsentStatus {
  scope: ConsentScope;
  granted: boolean;
  policyVersion: string;
  grantedAt?: number;
  withdrawnAt?: number;
}
