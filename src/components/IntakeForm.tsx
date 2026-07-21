import { useState } from 'react';
import {
  INTAKE_FORM,
  INTAKE_TAG_FIELDS,
  type IntakeFormField,
  type IntakeFormGroup,
} from '@drkyana/types';

/**
 * Patient intake form — rendered in chat when the agent calls collect_intake.
 * Asks the intake as a sequence of preset, i18n'd questions ONE AT A TIME (a
 * stepper), not a single wall-of-fields form. Each question can be answered or
 * skipped (except the required ones); the last question submits. None of this
 * hits the LLM — the questions come straight from INTAKE_FORM. On submit the
 * result keys match submit_intake's input exactly. The agent then reads the
 * answers back, asks for any corrections, and only then submits — so the form
 * itself has no review step; that conversation IS the review.
 *
 * Three things make it feel like an AI assistant rather than a dumb form:
 *  - `prefill` — the agent passes everything already known (what the patient
 *    just said, and for returning patients their record), so questions open
 *    populated; the patient reviews + fills gaps.
 *  - `verifiedEmail` — the email is the address the patient already verified;
 *    it is shown read-only on the first step and never asked as a question.
 *  - i18n — every label/group/option/placeholder/control renders via t(), so the
 *    flow speaks the patient's language (EN/BN/FA), not just English.
 */

type Value = string | string[] | number | null;
type FormData = Record<string, Value>;
type T = (key: string, fallback?: string) => string;

/** One question in the sequence: a field plus the group it belongs to (context). */
interface Step {
  group: IntakeFormGroup;
  field: IntakeFormField;
}

/**
 * Flatten the grouped form into a flat question sequence. `email` is excluded —
 * it is the verified address, shown read-only on review, never asked.
 */
const STEPS: Step[] = INTAKE_FORM.flatMap((g) =>
  g.fields.filter((f) => f.id !== 'email').map((f) => ({ group: g, field: f })),
);

function emptyValueFor(field: IntakeFormField): Value {
  if (INTAKE_TAG_FIELDS.has(field.id)) return [];
  if (field.type === 'number' || field.type === 'scale') return null;
  return '';
}

function emptyForm(): FormData {
  const out: FormData = {};
  for (const g of INTAKE_FORM) for (const f of g.fields) out[f.id] = emptyValueFor(f);
  return out;
}

function isEmpty(v: Value): boolean {
  return v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

/** Coerce a prefill value to the shape the field expects. */
function coercePrefill(fieldId: string, raw: unknown): Value | undefined {
  if (raw == null) return undefined;
  if (INTAKE_TAG_FIELDS.has(fieldId)) {
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw === 'string') return raw ? [raw] : [];
    return undefined;
  }
  if (typeof raw === 'number' || typeof raw === 'string') return raw;
  return undefined;
}

/** Build initial form state: empty → prefill → locked verified email → known name. */
function buildInitial(
  prefill: Record<string, unknown>,
  verifiedEmail: string,
  knownName: string,
): FormData {
  const data = emptyForm();
  for (const g of INTAKE_FORM) {
    for (const f of g.fields) {
      if (f.id === 'email' || f.id === 'name') continue; // set explicitly below
      const v = coercePrefill(f.id, prefill[f.id]);
      if (v !== undefined) data[f.id] = v;
    }
  }
  data.email = verifiedEmail;
  // The name is PII the model never handles: it comes from the patient's own
  // record (knownName), not from the agent's prefill. Editable for new patients.
  data.name = knownName;
  return data;
}

function parseTags(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Localized label for a field, with the required marker. */
function fieldLabel(t: T, field: IntakeFormField, required: boolean): string {
  return t(field.labelKey, field.label) + (required ? ' *' : '');
}

/** Localized placeholder (convention: `${labelKey}.ph`), falling back to schema. */
function fieldPlaceholder(t: T, field: IntakeFormField): string | undefined {
  if (!field.placeholder) return undefined;
  return t(`${field.labelKey}.ph`, field.placeholder);
}

/**
 * Tags input — keeps the RAW typed string in local state so spaces aren't eaten
 * mid-word, while ALSO pushing the parsed string[] up on every keystroke. The
 * live push matters in the stepper: tapping Next must not depend on a blur
 * having fired first, or the last-typed tags would be dropped.
 */
function TagsField({
  field,
  cls,
  label,
  placeholder,
  value,
  onChange,
}: {
  field: IntakeFormField;
  cls: string;
  label: string;
  placeholder?: string;
  value: Value;
  onChange: (v: Value) => void;
}) {
  const initial = Array.isArray(value) ? value.join(', ') : '';
  const [raw, setRaw] = useState(initial);
  return (
    <label className="block text-xs text-muted">
      {label}
      <input
        className={cls}
        placeholder={placeholder ?? field.placeholder ?? 'comma-separated'}
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          onChange(parseTags(e.target.value));
        }}
      />
    </label>
  );
}

function FieldRow({
  field,
  value,
  onChange,
  t,
}: {
  field: IntakeFormField;
  value: Value;
  onChange: (v: Value) => void;
  t: T;
}) {
  const label = fieldLabel(t, field, !!field.required);
  const placeholder = fieldPlaceholder(t, field);
  const cls =
    'mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none';

  if (field.type === 'select' && field.options) {
    return (
      <label className="block text-xs text-muted">
        {label}
        <select
          className={cls}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.labelKey, o.label)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === 'scale') {
    const v = typeof value === 'number' ? value : Number.NaN;
    const display = Number.isNaN(v) ? '—' : String(v);
    return (
      <label className="block text-xs text-muted">
        {label} <span className="ml-1 font-semibold text-ink">({display})</span>
        <input
          type="range"
          min={field.min ?? 0}
          max={field.max ?? 10}
          value={Number.isNaN(v) ? (field.min ?? 0) : v}
          onChange={(e) => onChange(Number(e.target.value))}
          className="mt-1 w-full"
        />
      </label>
    );
  }

  if (field.type === 'tags') {
    return (
      <TagsField
        field={field}
        cls={cls}
        label={label}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (field.type === 'textarea') {
    return (
      <label className="block text-xs text-muted">
        {label}
        <textarea
          className={cls}
          rows={3}
          placeholder={placeholder}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }

  // text | tel | email | number
  return (
    <label className="block text-xs text-muted">
      {label}
      <input
        className={cls}
        type={field.type}
        placeholder={placeholder}
        min={field.min}
        max={field.max}
        value={
          field.type === 'number'
            ? typeof value === 'number'
              ? value
              : ''
            : typeof value === 'string'
              ? value
              : ''
        }
        onChange={(e) =>
          onChange(
            field.type === 'number'
              ? e.target.value === ''
                ? null
                : Number(e.target.value)
              : e.target.value,
          )
        }
      />
    </label>
  );
}

/** Read-only verified-email row — the patient already confirmed this address. */
function VerifiedEmailRow({ t, email }: { t: T; email: string }) {
  return (
    <label className="block text-xs text-muted">
      {t('intake.field.email', 'Email')}
      <div className="mt-1 flex items-center gap-2 rounded-lg border border-ink/10 bg-surface-alt px-3 py-2 text-sm text-ink">
        <span className="truncate">{email || '—'}</span>
        <span className="ml-auto shrink-0 rounded-full bg-green/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green">
          {t('intake.field.email_verified', 'Verified')}
        </span>
      </div>
    </label>
  );
}

export function IntakeForm({
  reason,
  prefill,
  verifiedEmail,
  knownName,
  t,
  lang,
  onSubmit,
  disabled,
}: {
  reason: 'booking' | 'urgent';
  prefill?: Record<string, unknown>;
  verifiedEmail?: string;
  /** The patient's real name (from their record / prior entry). Never from the model. */
  knownName?: string;
  t: T;
  lang?: string;
  onSubmit: (data: FormData) => void;
  disabled?: boolean;
}) {
  const email = verifiedEmail ?? '';
  const [data, setData] = useState<FormData>(() =>
    buildInitial(prefill ?? {}, email, knownName ?? ''),
  );
  const [step, setStep] = useState(0); // index into STEPS
  const [requiredError, setRequiredError] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const setField = (id: string, v: Value) =>
    setData((d) => ({ ...d, [id]: v }));

  const total = STEPS.length;
  const current = STEPS[step];
  const field = current.field;
  const isLast = step === total - 1;

  /** Advance past the current question, gating required fields. */
  function goNext() {
    if (field.required && isEmpty(data[field.id])) {
      setRequiredError(true);
      return;
    }
    setRequiredError(false);
    setStep((s) => Math.min(s + 1, total - 1));
  }

  function skip() {
    if (field.required) return; // required fields cannot be skipped
    setRequiredError(false);
    setStep((s) => Math.min(s + 1, total - 1));
  }

  function back() {
    setRequiredError(false);
    setStep((s) => Math.max(s - 1, 0));
  }

  /** Submit the whole intake (last step). Returns to the agent, which reads it
   *  back and asks for corrections before it finalises. */
  function submit() {
    if (disabled || submitted) return;
    // Backstop: every required field must be filled. If one slipped through,
    // jump back to it rather than submitting an incomplete intake.
    const missing = STEPS.find((s) => s.field.required && isEmpty(data[s.field.id]));
    if (missing) {
      setStep(STEPS.indexOf(missing));
      setRequiredError(true);
      return;
    }
    setSubmitted(true);
    // Always carry the verified email; drop other empties for a compact payload.
    const compact: FormData = { email };
    for (const [k, v] of Object.entries(data)) {
      if (k === 'email') continue;
      if (isEmpty(v)) continue;
      compact[k] = v;
    }
    onSubmit(compact);
  }

  const title =
    reason === 'urgent'
      ? t('intake.form.title_urgent', 'Quick intake — please share the essentials')
      : t('intake.form.title_booking', 'Tell us a bit about you');

  const progress = t('intake.form.step_progress', 'Question {n} of {total}')
    .replace('{n}', String(step + 1))
    .replace('{total}', String(total));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (isLast) submit();
        else goNext();
      }}
      lang={lang}
      // Stable container so the chat panel doesn't jump as steps change height.
      className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm"
    >
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mb-3 text-xs text-muted">
        {t(
          'intake.form.help',
          'A few quick questions — answer what you can and skip the rest. Dr Kyana’s team will follow up.',
        )}
      </p>

      {/* The verified email is shown once, up front, so the patient knows which
          address Dr Kyana's team will use — it's never asked as a question. */}
      {step === 0 && (
        <div className="mb-3">
          <VerifiedEmailRow t={t} email={email} />
        </div>
      )}

      {/* Progress */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
          <span>{progress}</span>
          <span>{t(current.group.titleKey, current.group.title)}</span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-ink/5">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${((step + 1) / total) * 100}%` }}
          />
        </div>
      </div>

      <FieldRow
        key={field.id}
        field={field}
        value={data[field.id]}
        onChange={(v) => {
          setRequiredError(false);
          setField(field.id, v);
        }}
        t={t}
      />

      {requiredError && (
        <p className="mt-1 text-xs text-red">
          {t('intake.form.required_hint', 'This one is required to continue.')}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={back}
          disabled={disabled || submitted || step === 0}
          className="rounded-full border border-ink/15 px-4 py-2 text-sm text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('intake.form.back', 'Back')}
        </button>
        {!field.required && !isLast && (
          <button
            type="button"
            onClick={skip}
            disabled={disabled || submitted}
            className="rounded-full px-4 py-2 text-sm text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('intake.form.skip', 'Skip')}
          </button>
        )}
        <button
          type="submit"
          disabled={disabled || submitted}
          className="btn-primary ml-auto px-6"
        >
          {isLast
            ? submitted
              ? t('intake.form.submitting', 'Submitting…')
              : t('intake.form.submit', 'Submit intake')
            : t('intake.form.next', 'Next')}
        </button>
      </div>
    </form>
  );
}
