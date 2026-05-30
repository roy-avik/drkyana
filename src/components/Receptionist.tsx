import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from 'ai';
import { useTranslation } from '../i18n/useTranslation';
import { WHATSAPP_LINK } from './Contact';
import { IntakeForm } from './IntakeForm';

// ---------------------------------------------------------------------------
// Server-backed AI receptionist.
//
// The on-device Transformers.js classifier is gone: every message now POSTs to
// the patient agent endpoint (/api/agent/patient), where a server-only Claude
// agent classifies intent, runs the structured intake, triages, and submits to
// D1. Nothing clinical happens in the browser. A consent gate (stating that
// messages are processed by an AI service) must be acknowledged before chat.
// ---------------------------------------------------------------------------

type Phase = 'standby' | 'consent' | 'chat';

function newSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Pull the rendered text out of an assistant/user UI message's parts. */
function messageText(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

export function Receptionist() {
  const { t, lang } = useTranslation();

  const [phase, setPhase] = useState<Phase>('standby');
  const [draft, setDraft] = useState('');
  const sectionRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // One stable session id per mount.
  const sessionId = useMemo(newSessionId, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/agent/patient',
        // Carry the session id + locale alongside the messages each turn so the
        // server can load/persist history and reply in the patient's language.
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: { ...body, messages, sessionId, locale: lang },
        }),
      }),
    [sessionId, lang],
  );

  const { messages, sendMessage, status, error, addToolResult } = useChat({
    id: sessionId,
    transport,
    // After the client returns the intake form result, auto-resume the agent
    // so it runs triage + submit_intake without a manual nudge.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  const busy = status === 'submitted' || status === 'streaming';

  /** Most recent collect_intake tool call awaiting the patient's form input. */
  const pendingForm = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== 'assistant') continue;
      for (const part of m.parts) {
        const p = part as unknown as {
          type: string;
          state?: string;
          toolCallId?: string;
          input?: { reason?: 'booking' | 'urgent' };
        };
        if (p.type === 'tool-collect_intake' && p.state === 'input-available') {
          return {
            toolCallId: String(p.toolCallId ?? ''),
            reason: (p.input?.reason ?? 'booking') as 'booking' | 'urgent',
          };
        }
      }
    }
    return null;
  }, [messages]);

  /** Most recent email_verification tool call awaiting the OTP round-trip. */
  const pendingOtp = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== 'assistant') continue;
      for (const part of m.parts) {
        const p = part as unknown as {
          type: string;
          state?: string;
          toolCallId?: string;
          input?: { email?: string };
        };
        if (
          p.type === 'tool-email_verification' &&
          p.state === 'input-available'
        ) {
          return {
            toolCallId: String(p.toolCallId ?? ''),
            initialEmail: p.input?.email ?? '',
          };
        }
      }
    }
    return null;
  }, [messages]);

  // Auto-scroll the transcript on new content.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, status]);

  function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    void sendMessage({ text });
  }

  return (
    <section id="receptionist" ref={sectionRef} className="py-16 md:py-24">
      <div className="container-page">
        <div className="mx-auto max-w-2xl">
          <div className="text-center">
            <span className="section-label">{t('receptionist.label')}</span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
              {t('receptionist.title')}
            </h2>
            <p className="mt-4 text-muted md:text-lg">{t('receptionist.subtitle')}</p>
          </div>

          <div className="mt-8 flex min-h-[22rem] flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-ink/5">
            {/* Standby — entry point */}
            {phase === 'standby' && (
              <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-10 md:py-14">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/8">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7 text-brand">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                  </svg>
                </div>
                <p className="max-w-sm text-center text-sm text-muted">{t('receptionist.privacy')}</p>
                <button
                  type="button"
                  onClick={() => setPhase('consent')}
                  className="btn-primary px-8 py-3"
                >
                  {t('receptionist.start_button')}
                </button>
              </div>
            )}

            {/* Consent gate — states messages are processed by an AI service */}
            {phase === 'consent' && (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10 md:py-14">
                <p className="max-w-md text-center text-sm text-ink">
                  {t('intake.consent.message')}
                </p>
                <div className="flex flex-col items-stretch gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setPhase('chat')}
                    className="btn-primary px-6 py-2.5"
                  >
                    {t('intake.consent.accept')}
                  </button>
                  <a
                    href={WHATSAPP_LINK}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-ink/10 px-6 py-2.5 text-center text-sm text-muted hover:text-ink"
                  >
                    {t('intake.escape')}
                  </a>
                </div>
              </div>
            )}

            {/* Active chat */}
            {phase === 'chat' && (
              <>
                <div
                  ref={scrollRef}
                  className="flex max-h-[32rem] min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5 md:p-6"
                >
                  {/* Static greeting so the panel is never empty on entry. */}
                  <ChatBubble role="assistant" text={t('receptionist.greeting')} />
                  {messages.map((m) => {
                    const text = messageText(m);
                    if (!text) return null;
                    return <ChatBubble key={m.id} role={m.role} text={text} />;
                  })}
                  {status === 'submitted' && !pendingForm && (
                    <ChatBubble role="assistant" text={t('receptionist.thinking')} />
                  )}
                  {pendingForm && (
                    <IntakeForm
                      reason={pendingForm.reason}
                      disabled={busy}
                      onSubmit={(data) =>
                        void addToolResult({
                          tool: 'collect_intake',
                          toolCallId: pendingForm.toolCallId,
                          output: data,
                        })
                      }
                    />
                  )}
                  {pendingOtp && (
                    <OtpStep
                      sessionId={sessionId}
                      locale={lang}
                      initialEmail={pendingOtp.initialEmail}
                      disabled={busy}
                      t={t}
                      onComplete={(verifiedEmail) =>
                        void addToolResult({
                          tool: 'email_verification',
                          toolCallId: pendingOtp.toolCallId,
                          output: { verified: true, email: verifiedEmail },
                        })
                      }
                    />
                  )}
                  {error && (
                    <p className="text-center text-xs text-red-600">
                      {t('receptionist.submit.error')}
                    </p>
                  )}
                </div>

                <div className="border-t border-ink/5 bg-surface-alt p-4 md:p-5">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      send();
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={
                        pendingForm || pendingOtp
                          ? 'Please complete the step above to continue'
                          : t('receptionist.placeholder')
                      }
                      disabled={busy || !!pendingForm || !!pendingOtp}
                      className="flex-1 rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-60"
                    />
                    <button
                      type="submit"
                      disabled={!draft.trim() || busy || !!pendingForm || !!pendingOtp}
                      className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      ↑
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>

          <p className="mt-4 text-center text-xs text-muted">{t('receptionist.privacy')}</p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function ChatBubble({ role, text }: { role: string; text: string }) {
  const isBot = role !== 'user';
  return (
    <div className={isBot ? 'flex justify-start' : 'flex justify-end'}>
      <div
        className={[
          'max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isBot ? 'bg-brand/8 text-ink' : 'bg-brand text-white',
        ].join(' ')}
      >
        {text}
      </div>
    </div>
  );
}

/**
 * Email OTP verification step (plan item 1).
 *
 * Two phases driven by local state:
 *   1. `email` — collect/confirm the email; POST /api/auth/patient/email/request.
 *   2. `code`  — collect the 6-digit code; POST /api/auth/patient/email/verify.
 *
 * On success, calls `onComplete(verifiedEmail)` which addToolResults the
 * server-confirmed email back to the agent. The server-side stamp on the
 * session row (set by the verify endpoint) is what actually gates the
 * subsequent submit_intake call — this component's output is just the ack.
 */
function OtpStep({
  sessionId,
  locale,
  initialEmail,
  disabled,
  t,
  onComplete,
}: {
  sessionId: string;
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
        body: JSON.stringify({ sessionId, email: email.trim(), locale }),
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
        body: JSON.stringify({ sessionId, email: email.trim(), code: code.trim() }),
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
          {/* Consent moment — verifying creates the patient record + covers
              internal AI-assisted workflow (item 4). Tap Verify is the
              affirmative act, matching the chat-start consent pattern. */}
          <p className="text-[11px] leading-relaxed text-muted">
            {t('receptionist.otp.consent')}
          </p>
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
