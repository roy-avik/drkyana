/**
 * PII hygiene for the patient agent loop.
 *
 * The patient's real name must never reach the LLM or the persisted chat log.
 * The intake form (client-rendered `collect_intake`) returns the name inside its
 * tool RESULT; before those messages are converted to model messages or saved,
 * we lift the real name out and replace it with PATIENT_NAME_TOKEN. The real
 * value is handed to the caller (the Pages Function stashes it on the session so
 * `submit_intake` can read it from context — never from model args).
 *
 * Server-only. The model only ever sees the token; the client resolves the token
 * back to the real name via the Patient Object (GET /api/patient/object).
 */
import { PATIENT_NAME_TOKEN } from "@drkyana/types";

type AnyMessage = {
  role?: string;
  parts?: Array<Record<string, unknown>>;
};

const COLLECT_INTAKE_PART = "tool-collect_intake";

/** Is this a collect_intake tool part carrying a result `output`? */
function isCollectIntakeResult(
  part: Record<string, unknown>,
): part is Record<string, unknown> & { output: Record<string, unknown> } {
  return (
    part?.type === COLLECT_INTAKE_PART &&
    typeof part.output === "object" &&
    part.output !== null
  );
}

export interface StripPatientNameResult<T> {
  /** Messages with any collect_intake `output.name` replaced by the token. */
  messages: T[];
  /** The real name lifted out, if one was present (and not already the token). */
  name?: string;
}

/**
 * Return a copy of `messages` with the patient's real name removed from every
 * collect_intake tool result (replaced by PATIENT_NAME_TOKEN), plus the real
 * name if found. Pure — does not mutate the input. The last real name wins (the
 * patient may resubmit/correct the form).
 */
export function stripPatientName<T>(messages: T[]): StripPatientNameResult<T> {
  let found: string | undefined;

  const out = (messages as unknown as AnyMessage[]).map((msg) => {
    if (!msg || !Array.isArray(msg.parts)) return msg;
    let touched = false;
    const parts = msg.parts.map((part) => {
      if (!isCollectIntakeResult(part)) return part;
      const name = part.output.name;
      if (typeof name !== "string" || name === PATIENT_NAME_TOKEN) return part;
      found = name;
      touched = true;
      return {
        ...part,
        output: { ...part.output, name: PATIENT_NAME_TOKEN },
      };
    });
    return touched ? { ...msg, parts } : msg;
  });

  return { messages: out as unknown as T[], name: found };
}
