import { useState } from 'react';
import { LegalLine } from './LegalLine';
import { Button, Input } from '@drkyana/ui';

/**
 * Email OTP verification step.
 *
 * Two phases driven by local state:
 *   1. `email` — collect/confirm the email; POST /api/auth/patient/email/request.
 *   2. `code`  — collect the 6-digit code; POST /api/auth/patient/email/verify.
 *
 * On success, calls `onComplete(verifiedEmail)`. The verify endpoint sets a
 * signed httpOnly session cookie + stamps the session row verified; that cookie
 * is what gates every subsequent patient request. The session id is never
 * handled here — the request/verify endpoints mint + read it from the cookie.
 *
 * Shared by the receptionist (gates the chat) and the account page (gates the
 * patient's own records view).
 */
export function OtpStep({
  locale,
  initialEmail,
  disabled,
  t,
  onComplete,
}: {
  locale: string;
  initialEmail: string;
  disabled: boolean;
  t: (key: string, fallback?: string) => string;
  onComplete: (verifiedEmail: string) => void;
}) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  function resolveErrorMessage(key: string): string {
    // The API returns short codes (bad_email, rate_limit_email, etc.). Map them
    // to a finite set of receptionist.otp.error.* locale keys; unknown codes
    // fall back to a generic send_failed string.
    const known = new Set([
      'bad_email',
      'invalid_code',
      'expired',
      'too_many_attempts',
      'send_failed',
    ]);
    if (key === 'rate_limit_email' || key === 'rate_limit_ip' || key === 'rate_limited') {
      return t('receptionist.otp.error.rate_limit');
    }
    if (key === 'no_pending_code') {
      // Treat "no pending code" as "send first" — clearer for the patient.
      return t('receptionist.otp.error.send_failed');
    }
    if (known.has(key)) {
      return t(`receptionist.otp.error.${key}`);
    }
    return t('receptionist.otp.error.send_failed');
  }

  async function sendCode() {
    setBusy(true);
    setErrorKey(null);
    try {
      const r = await fetch('/api/auth/patient/email/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: email.trim(), locale }),
      });
      let data: { ok?: boolean; error?: string } = {};
      try {
        data = (await r.json()) as typeof data;
      } catch {
        /* ignore — handled by !ok */
      }
      if (!r.ok || !data.ok) {
        setErrorKey(data.error ?? 'send_failed');
        return;
      }
      setStep('code');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setBusy(true);
    setErrorKey(null);
    try {
      const r = await fetch('/api/auth/patient/email/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        // `locale` is recorded on the consent rows written in the same batch
        // that marks this session verified — it captures which translation of
        // the notice the patient actually read.
        body: JSON.stringify({ email: email.trim(), code: code.trim(), locale }),
      });
      let data: { ok?: boolean; verifiedEmail?: string; error?: string } = {};
      try {
        data = (await r.json()) as typeof data;
      } catch {
        /* ignore */
      }
      if (!r.ok || !data.ok) {
        setErrorKey(data.error ?? 'invalid_code');
        return;
      }
      onComplete(data.verifiedEmail ?? email.trim());
    } finally {
      setBusy(false);
    }
  }

  const cannotSend = !email.trim() || busy || disabled;
  const cannotVerify = code.trim().length !== 6 || busy || disabled;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-brand/15 bg-brand/5 p-4">
      <p className="text-sm font-semibold text-ink">{t('receptionist.otp.title')}</p>
      {step === 'email' ? (
        <>
          <p className="text-xs text-muted">{t('receptionist.otp.email_explainer')}</p>
          <Input
            shape="pill"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('receptionist.otp.email_prompt')}
            disabled={busy || disabled}
          />
          <Button
            type="button"
            shape="pill"
            tone="brand"
            className="!min-h-0 self-start !px-5 !py-2 font-semibold"
            onClick={() => void sendCode()}
            disabled={cannotSend}
          >
            {t('receptionist.otp.send')}
          </Button>
        </>
      ) : (
        <>
          <p className="text-xs text-muted">
            {t('receptionist.otp.code_explainer').replace('{email}', email)}
          </p>
          <Input
            shape="pill"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            disabled={busy || disabled}
            className="text-center font-mono text-base tracking-[0.4em]"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              shape="pill"
              tone="brand"
              className="!min-h-0 !px-5 !py-2 font-semibold"
              onClick={() => void verifyCode()}
              disabled={cannotVerify}
            >
              {t('receptionist.otp.verify')}
            </Button>
            <Button
              type="button"
              shape="pill"
              tone="neutral"
              className="!min-h-0 !border-ink/10 !bg-transparent !px-5 !py-2 !text-muted hover:!border-ink/10 hover:!bg-transparent hover:!text-ink"
              onClick={() => void sendCode()}
              disabled={busy || disabled}
            >
              {t('receptionist.otp.resend')}
            </Button>
            <button
              type="button"
              onClick={() => setStep('email')}
              disabled={busy || disabled}
              className="text-xs text-muted underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              {email}
            </button>
          </div>
        </>
      )}
      {errorKey && (
        <p className="text-xs text-red">{resolveErrorMessage(errorKey)}</p>
      )}
      {/* Verifying RECORDS the consents (they are written in the same D1 batch
          that marks the session verified — see verifyOtp), so the legal line
          must be visible here too: /account reaches this step without ever
          passing the receptionist's consent gate. */}
      <LegalLine
        t={t}
        templateKey="receptionist.otp.legal"
        fallback="Verifying your email records your consent as described in the {privacy} and your acceptance of the {terms}."
        className="text-xs text-muted"
      />
    </div>
  );
}
