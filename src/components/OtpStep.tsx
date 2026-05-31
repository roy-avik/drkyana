import { useState } from 'react';

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
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
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
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('receptionist.otp.email_prompt')}
            disabled={busy || disabled}
            className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <button
            type="button"
            onClick={() => void sendCode()}
            disabled={cannotSend}
            className="self-start rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('receptionist.otp.send')}
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-muted">
            {t('receptionist.otp.code_explainer').replace('{email}', email)}
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            disabled={busy || disabled}
            className="rounded-full border border-ink/10 bg-white px-4 py-2 text-center font-mono text-base tracking-[0.4em] text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void verifyCode()}
              disabled={cannotVerify}
              className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('receptionist.otp.verify')}
            </button>
            <button
              type="button"
              onClick={() => void sendCode()}
              disabled={busy || disabled}
              className="rounded-full border border-ink/10 px-5 py-2 text-sm text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('receptionist.otp.resend')}
            </button>
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
        <p className="text-xs text-red-600">{resolveErrorMessage(errorKey)}</p>
      )}
    </div>
  );
}
