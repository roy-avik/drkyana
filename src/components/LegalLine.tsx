import type { ReactNode } from 'react';
import { Link } from '../router';
import { CONSENT_POLICY_VERSION } from '@drkyana/types';

// ---------------------------------------------------------------------------
// The one-line legal acknowledgment shown wherever consent is given: the
// receptionist's consent gate and the OTP step (verifying on /account records
// the same consents, so the same line must be visible there too — consent a
// patient never saw is not consent).
//
// The sentence is a locale template with {terms} / {privacy} placeholders so
// translators position the links grammatically; this component splits on the
// placeholders and renders real <Link>s. The policy version is shown inline —
// it is the exact CONSENT_POLICY_VERSION recorded on the consent rows.
// ---------------------------------------------------------------------------

export function LegalLine({
  t,
  templateKey,
  fallback,
  className,
}: {
  t: (key: string, fallback?: string) => string;
  /** Locale key of the sentence containing {terms} and {privacy}. */
  templateKey: string;
  fallback: string;
  className?: string;
}) {
  const template = t(templateKey, fallback);
  const parts = template.split(/(\{terms\}|\{privacy\})/);
  const linkCls = 'underline underline-offset-2 hover:text-ink';

  const rendered: ReactNode[] = parts.map((part, i) => {
    if (part === '{terms}') {
      return (
        <Link key={i} to="/terms" className={linkCls}>
          {t('legal.terms.link_label', 'Terms of Service')}
        </Link>
      );
    }
    if (part === '{privacy}') {
      return (
        <Link key={i} to="/privacy" className={linkCls}>
          {t('legal.privacy.link_label', 'Privacy Policy')}
        </Link>
      );
    }
    return part;
  });

  return (
    <p className={className ?? 'text-center text-xs text-muted'}>
      {rendered}{' '}
      <span className="whitespace-nowrap">
        ({t('legal.version_label', 'Policy version')}: {CONSENT_POLICY_VERSION})
      </span>
    </p>
  );
}
