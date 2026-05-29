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
 * through. Phone is the only hard-required field (the patient's match key).
 */

type Value = string | string[] | number | null;
type FormData = Record<string, Value>;

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

function parseTags(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: IntakeFormField;
  value: Value;
  onChange: (v: Value) => void;
}) {
  const label = field.label + (field.required ? ' *' : '');
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
              {o.label}
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
    const tags = Array.isArray(value) ? value : [];
    return (
      <label className="block text-xs text-muted">
        {label}
        <input
          className={cls}
          placeholder={field.placeholder ?? 'comma-separated'}
          value={tags.join(', ')}
          onChange={(e) => onChange(parseTags(e.target.value))}
        />
      </label>
    );
  }

  if (field.type === 'textarea') {
    return (
      <label className="block text-xs text-muted">
        {label}
        <textarea
          className={cls}
          rows={3}
          placeholder={field.placeholder}
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
        placeholder={field.placeholder}
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

export function IntakeForm({
  reason,
  onSubmit,
  disabled,
}: {
  reason: 'booking' | 'urgent';
  onSubmit: (data: FormData) => void;
  disabled?: boolean;
}) {
  const [data, setData] = useState<FormData>(emptyForm);
  const [submitted, setSubmitted] = useState(false);

  const setField = (id: string, v: Value) => setData((d) => ({ ...d, [id]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled || submitted) return;
    const phone = data.phone;
    if (typeof phone !== 'string' || phone.trim().length < 3) {
      window.alert('Please enter your phone number — it is required.');
      return;
    }
    setSubmitted(true);
    // Drop empties so the agent/tool receives a compact payload.
    const compact: FormData = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
      compact[k] = v;
    }
    onSubmit(compact);
  }

  const title =
    reason === 'urgent'
      ? 'Quick intake — please share the essentials'
      : 'Tell us a bit about you';

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm"
    >
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mb-3 text-xs text-muted">
        Fill this in one go — Dr Kyana&rsquo;s team will follow up. Required fields
        are marked *.
      </p>
      {INTAKE_FORM.map((g) => (
        <fieldset key={g.id} className="mb-3 border-t border-ink/5 pt-3">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {g.title}
          </legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {g.fields.map((f) => (
              <FieldRow
                key={f.id}
                field={f}
                value={data[f.id]}
                onChange={(v) => setField(f.id, v)}
              />
            ))}
          </div>
        </fieldset>
      ))}
      <button
        type="submit"
        className="btn-primary mt-2 w-full"
        disabled={disabled || submitted}
      >
        {submitted ? 'Submitting…' : 'Submit intake'}
      </button>
    </form>
  );
}
