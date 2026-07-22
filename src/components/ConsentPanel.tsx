import { useCallback, useEffect, useState } from 'react';
import { Link } from '../router';

// Consent control for the signed-in patient (PDPA 2026). The law requires that
// withdrawing consent be as easy as giving it, so this is a real control, not
// a paragraph pointing at an email address.
//
// Withdrawing `ai_inference` takes effect on the next receptionist turn — the
// patient agent endpoint re-checks consent per request.

type Scope = 'care' | 'ai_inference' | 'email' | 'mcp_third_party';

interface ConsentStatus {
  scope: Scope;
  granted: boolean;
  policyVersion: string;
  grantedAt?: number;
  withdrawnAt?: number;
}

/**
 * Scopes the patient can toggle here.
 *
 * `care` is deliberately absent: withdrawing it means erasing the medical
 * record, which needs a support conversation (and a retention/legal check),
 * not a toggle. `mcp_third_party` arrives with the patient MCP app.
 *
 * Only these scopes carry copy — an entry here without a rendered toggle would
 * be a locale key nobody displays, which scripts/locales.py rightly rejects.
 */
type ManageableScope = Extract<Scope, 'ai_inference' | 'email'>;

const COPY: Record<
  ManageableScope,
  { titleKey: string; titleEn: string; bodyKey: string; bodyEn: string }
> = {
  ai_inference: {
    titleKey: 'consent.ai.title',
    titleEn: 'AI receptionist',
    bodyKey: 'consent.ai.body',
    bodyEn:
      'Your messages to the AI receptionist are processed by Anthropic (Claude), outside Bangladesh. Turn this off and the receptionist stops; you can still contact the practice directly.',
  },
  email: {
    titleKey: 'consent.email.title',
    titleEn: 'Email',
    bodyKey: 'consent.email.body',
    bodyEn: 'Email about your appointments, intake and treatment documents.',
  },
};

const MANAGEABLE = Object.keys(COPY) as ManageableScope[];

export function ConsentPanel({
  t,
  lang,
}: {
  t: (key: string, fallback?: string) => string;
  lang: string;
}) {
  const [consents, setConsents] = useState<ConsentStatus[] | null>(null);
  const [busy, setBusy] = useState<Scope | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/patient/consents', { credentials: 'same-origin' });
      const d = (await r.json()) as { verified?: boolean; consents?: ConsentStatus[] };
      setConsents(d.verified ? (d.consents ?? []) : null);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(scope: Scope, granted: boolean) {
    setBusy(scope);
    setError(false);
    try {
      const r = await fetch('/api/patient/consents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ scope, action: granted ? 'withdraw' : 'grant', locale: lang }),
      });
      const d = (await r.json()) as { consents?: ConsentStatus[] };
      if (!r.ok) throw new Error('failed');
      setConsents(d.consents ?? []);
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }

  if (!consents) return null;

  const stateOf = (scope: Scope) => consents.find((c) => c.scope === scope)?.granted ?? false;

  return (
    <section className="mt-10" aria-labelledby="consent-heading">
      <h2 id="consent-heading" className="text-sm font-semibold text-ink">
        {t('consent.heading', 'Your permissions')}
      </h2>
      <p className="mt-1 text-xs text-muted">
        {t(
          'consent.subheading',
          'You can change these at any time. Changes take effect from your next message.',
        )}{' '}
        <Link to="/privacy" className="underline underline-offset-2 hover:text-ink">
          {t('legal.privacy.link_label', 'Privacy Notice')}
        </Link>
      </p>

      <ul className="mt-4 flex flex-col gap-3">
        {MANAGEABLE.map((scope) => {
          const granted = stateOf(scope);
          const copy = COPY[scope];
          return (
            <li
              key={scope}
              className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    {t(copy.titleKey, copy.titleEn)}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    {t(copy.bodyKey, copy.bodyEn)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void toggle(scope, granted)}
                  disabled={busy === scope}
                  aria-pressed={granted}
                  className={[
                    'shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition-colors',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    granted
                      ? 'border-ink/15 text-muted hover:border-red/40 hover:text-red'
                      : 'border-brand bg-brand text-white',
                  ].join(' ')}
                >
                  {busy === scope
                    ? t('consent.saving', 'Saving…')
                    : granted
                      ? t('consent.withdraw', 'Turn off')
                      : t('consent.grant', 'Turn on')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <p role="status" aria-live="polite" className="mt-3 text-xs text-red">
        {error ? t('consent.error', 'Could not update your permissions. Please try again.') : ''}
      </p>
    </section>
  );
}
