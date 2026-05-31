import { useState } from 'react';
import {
  INTAKE_FORM,
  INTAKE_TAG_FIELDS,
  type IntakeFormField,
} from '@drkyana/types';

/**
 * Patient intake form — rendered in chat when the agent calls collect_intake.
 * Collects the whole intake in ONE step (no slot-by-slot LLM round-trips); the
 * result keys match submit_intake's input exactly so it can be passed straight
 * through.
 *
 * Three things make it feel like an AI assistant rather than a dumb form:
 *  - `prefill` — the agent passes everything the patient already said, so the
 *    form opens populated; the patient reviews + fills gaps.
 *  - `verifiedEmail` — the email field is pre-filled (read-only) with the
 *    address the patient already verified; they can't (and needn't) edit it.
 *  - i18n — every label/group/option/placeholder renders via t(), so the form
 *    speaks the patient's language (EN/BN/FA), not just English.
 */

type Value = string | string[] | number | null;
type FormData = Record<string, Value>;
type T = (key: string, fallback?: string) => string;

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

/** Build initial form state: empty → prefill → locked verified email. */
function buildInitial(
  prefill: Record<string, unknown>,
  verifiedEmail: string,
): FormData {
  const data = emptyForm();
  for (const g of INTAKE_FORM) {
    for (const f of g.fields) {
      if (f.id === 'email') continue; // email is the verified address, set below
      const v = coercePrefill(f.id, prefill[f.id]);
      if (v !== undefined) data[f.id] = v;
    }
  }
  data.email = verifiedEmail;
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
 * mid-word. Only parses into string[] when the user leaves the field.
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
        onChange={(e) => setRaw(e.target.value)}
        onBlur={() => onChange(parseTags(raw))}
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
  t,
  lang,
  onSubmit,
  disabled,
}: {
  reason: 'booking' | 'urgent';
  prefill?: Record<string, unknown>;
  verifiedEmail?: string;
  t: T;
  lang?: string;
  onSubmit: (data: FormData) => void;
  disabled?: boolean;
}) {
  const email = verifiedEmail ?? '';
  const [data, setData] = useState<FormData>(() =>
    buildInitial(prefill ?? {}, email),
  );
  const [submitted, setSubmitted] = useState(false);

  const setField = (id: string, v: Value) => setData((d) => ({ ...d, [id]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled || submitted) return;
    const phone = data.phone;
    if (typeof phone !== 'string' || phone.trim().length < 3) {
      window.alert(
        t(
          'intake.form.phone_required',
          'Please enter your phone number — it is required.',
        ),
      );
      return;
    }
    setSubmitted(true);
    // Always carry the verified email; drop other empties for a compact payload.
    const compact: FormData = { email };
    for (const [k, v] of Object.entries(data)) {
      if (k === 'email') continue;
      if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
      compact[k] = v;
    }
    onSubmit(compact);
  }

  const title =
    reason === 'urgent'
      ? t('intake.form.title_urgent', 'Quick intake — please share the essentials')
      : t('intake.form.title_booking', 'Tell us a bit about you');

  return (
    <form
      onSubmit={submit}
      lang={lang}
      className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm"
    >
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mb-3 text-xs text-muted">
        {t(
          'intake.form.help',
          'Fill this in one go — Dr Kyana’s team will follow up. Required fields are marked *.',
        )}
      </p>
      {INTAKE_FORM.map((g) => (
        <fieldset key={g.id} className="mb-3 border-t border-ink/5 pt-3">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {t(g.titleKey, g.title)}
          </legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {g.fields.map((f) =>
              f.id === 'email' ? (
                <VerifiedEmailRow key={f.id} t={t} email={email} />
              ) : (
                <FieldRow
                  key={f.id}
                  field={f}
                  value={data[f.id]}
                  onChange={(v) => setField(f.id, v)}
                  t={t}
                />
              ),
            )}
          </div>
        </fieldset>
      ))}
      <button
        type="submit"
        className="btn-primary mt-2 w-full"
        disabled={disabled || submitted}
      >
        {submitted
          ? t('intake.form.submitting', 'Submitting…')
          : t('intake.form.submit', 'Submit intake')}
      </button>
    </form>
  );
}
