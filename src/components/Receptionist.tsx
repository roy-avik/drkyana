import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from 'ai';
import { PATIENT_NAME_TOKEN } from '@drkyana/types';
import { useTranslation } from '../i18n/useTranslation';
import { CLINIC_EMAIL } from './Contact';
import { IntakeForm } from './IntakeForm';
import { OtpStep } from './OtpStep';
import { Link } from '../router';
import { renderMarkdown } from '../lib/markdown';

// ---------------------------------------------------------------------------
// Server-backed AI receptionist.
//
// The on-device Transformers.js classifier is gone: every message now POSTs to
// the patient agent endpoint (/api/agent/patient), where a server-only Claude
// agent classifies intent, runs the structured intake, triages, and submits to
// D1. Nothing clinical happens in the browser. A consent gate (stating that
// messages are processed by an AI service) must be acknowledged before chat.
// ---------------------------------------------------------------------------

// Flow order: standby → consent (AI + health-data) → otp (verify email) → chat.
// The agent endpoint rejects any message from an unverified session, so the
// OTP step gates the whole conversation, not just submission.
//
// Session is COOKIE-AUTHORITATIVE: the server sets a signed httpOnly cookie on
// OTP verify, and every patient endpoint reads the session id from it. The
// client never holds the id. On mount we ask the server whether this browser is
// already verified (GET /api/auth/patient/session) and, if so, restore the
// transcript and skip straight to chat — so a refresh no longer resets anything.
type Phase = 'standby' | 'consent' | 'otp' | 'chat';

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
  // The patient's verified email — from OTP verify or session restore. Used to
  // prefill the intake form's (read-only) email field.
  const [verifiedEmail, setVerifiedEmail] = useState('');
  // The patient's real NAME. It never travels through the LLM — the agent uses
  // PATIENT_NAME_TOKEN and we resolve the real name here (from the Patient
  // Object for returning patients, or the form they just filled) purely for
  // display + form prefill. PII stays server-side until this owner asks for it.
  const [patientName, setPatientName] = useState('');
  // After the intake is submitted the chat ends; "Ask another question" reopens it.
  const [reopened, setReopened] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);

  /** Resolve the patient's real name from the owner-only Patient Object. */
  const loadPatientName = useCallback(async () => {
    try {
      const res = await fetch('/api/patient/object', {
        credentials: 'same-origin',
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        verified?: boolean;
        patient?: { name?: string | null } | null;
      };
      if (data.verified && data.patient?.name) setPatientName(data.patient.name);
    } catch {
      // Best-effort; the token simply falls back to a neutral word if unresolved.
    }
  }, []);

  /** Swap the name token for the real name in assistant text (PII never hit the LLM). */
  const renderNames = useCallback(
    (text: string): string =>
      text.split(PATIENT_NAME_TOKEN).join(patientName || t('receptionist.you', 'there')),
    [patientName, t],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/agent/patient',
        // The session id lives in the httpOnly cookie (sent automatically with
        // this same-origin request); we only carry the messages + locale so the
        // server can persist history and reply in the patient's language.
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: { ...body, messages, locale: lang },
        }),
      }),
    [lang],
  );

  const { messages, setMessages, sendMessage, status, error, addToolResult } =
    useChat({
      transport,
      // After the client returns the intake form result, auto-resume the agent
      // so it runs triage + submit_intake without a manual nudge.
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    });

  // On mount, ask the server whether this browser already has a verified
  // session (cookie). If so, restore the transcript and jump to chat — refresh
  // no longer drops verification or history.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/auth/patient/session', {
          credentials: 'same-origin',
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          verified?: boolean;
          email?: string;
          patientId?: string | null;
          messages?: UIMessage[];
        };
        if (cancelled || !data.verified) return;
        if (data.email) setVerifiedEmail(data.email);
        if (Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages(data.messages);
        }
        // Resolve the real name for display/prefill (returning patients).
        void loadPatientName();
        setPhase('chat');
      } catch {
        // Best-effort restore; fall back to the standby entry point.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setMessages, loadPatientName]);

  const busy = status === 'submitted' || status === 'streaming';

  /** True once the agent has submitted the intake — the chat is then over. */
  const intakeSubmitted = useMemo(() => {
    for (const m of messages) {
      if (m.role !== 'assistant') continue;
      for (const part of m.parts) {
        const p = part as unknown as { type?: string; state?: string };
        if (
          p.type === 'tool-submit_intake' &&
          (p.state === 'output-available' || p.state === 'result')
        ) {
          return true;
        }
      }
    }
    return false;
  }, [messages]);

  /** The chat is closed once the intake is in — unless the patient reopened it. */
  const ended = intakeSubmitted && !reopened;

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
          input?: { reason?: 'booking' | 'urgent'; prefill?: Record<string, unknown> };
        };
        if (p.type === 'tool-collect_intake' && p.state === 'input-available') {
          return {
            toolCallId: String(p.toolCallId ?? ''),
            reason: (p.input?.reason ?? 'booking') as 'booking' | 'urgent',
            prefill: (p.input?.prefill ?? {}) as Record<string, unknown>,
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
        <div className="mx-auto max-w-3xl">
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

            {/* Consent gate — AI processing + health-data sharing with the LLM
                provider. Must be accepted BEFORE email verification. */}
            {phase === 'consent' && (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10 md:py-14">
                <p className="max-w-md text-center text-sm text-ink">
                  {t('intake.consent.message')}
                </p>
                <p className="max-w-md text-center text-xs text-muted">
                  {t('intake.consent.health')}
                </p>
                <div className="flex flex-col items-stretch gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setPhase('otp')}
                    className="btn-primary px-6 py-2.5"
                  >
                    {t('intake.consent.accept')}
                  </button>
                  {/* Escape hatch for a patient who declines the AI consent —
                      they must still be able to reach the practice. Points at
                      the clinic mailbox until the admin-side escalation
                      workflow ships; Dr Kyana's personal number is not
                      published (see Contact.tsx). */}
                  <a
                    href={`mailto:${CLINIC_EMAIL}`}
                    className="rounded-full border border-ink/10 px-6 py-2.5 text-center text-sm text-muted hover:text-ink"
                  >
                    {t('intake.escape')}
                  </a>
                </div>
              </div>
            )}

            {/* Email verification — gates the whole conversation. On success,
                the session row is stamped verified and we advance to chat. */}
            {phase === 'otp' && (
              <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 md:py-14">
                <div className="w-full max-w-sm">
                  <OtpStep
                    locale={lang}
                    initialEmail=""
                    disabled={false}
                    t={t}
                    onComplete={(email) => {
                      setVerifiedEmail(email);
                      void loadPatientName();
                      setPhase('chat');
                    }}
                  />
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
                    // Assistant text may carry the name token — resolve it for
                    // display. The patient's own text is shown verbatim.
                    const shown = m.role === 'assistant' ? renderNames(text) : text;
                    return <ChatBubble key={m.id} role={m.role} text={shown} />;
                  })}
                  {status === 'submitted' && !pendingForm && (
                    <ChatBubble role="assistant" text={t('receptionist.thinking')} />
                  )}
                  {pendingForm && (
                    <IntakeForm
                      reason={pendingForm.reason}
                      prefill={pendingForm.prefill}
                      verifiedEmail={verifiedEmail}
                      knownName={patientName}
                      t={t}
                      lang={lang}
                      disabled={busy}
                      onSubmit={(data) => {
                        // Keep the real name on the client for display/records;
                        // it travels to the server in the result but is stripped
                        // there before ever reaching the model.
                        if (typeof data.name === 'string' && data.name.trim()) {
                          setPatientName(data.name.trim());
                        }
                        void addToolResult({
                          tool: 'collect_intake',
                          toolCallId: pendingForm.toolCallId,
                          output: data,
                        });
                      }}
                    />
                  )}
                  {error && (
                    <p className="text-center text-xs text-red">
                      {t('receptionist.submit.error')}
                    </p>
                  )}
                </div>

                <div className="border-t border-ink/5 bg-surface-alt p-4 md:p-5">
                  {ended ? (
                    // Intake submitted — the chat is closed. Offer the records
                    // page and a way to start a fresh question if needed.
                    <div className="flex flex-col items-center gap-3 text-center">
                      <p className="text-sm font-semibold text-ink">
                        {t('receptionist.done.title', 'Your intake is submitted')}
                      </p>
                      <p className="text-xs text-muted">
                        {t(
                          'receptionist.done.body',
                          'Dr Kyana’s team will reach out to confirm. You can review it any time in your records.',
                        )}
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        <Link to="/account" className="btn-primary px-5 py-2">
                          {t('receptionist.done.records', 'View my records')}
                        </Link>
                        <button
                          type="button"
                          onClick={() => setReopened(true)}
                          className="rounded-full border border-ink/15 px-5 py-2 text-sm text-muted hover:text-ink"
                        >
                          {t('receptionist.done.again', 'Ask another question')}
                        </button>
                      </div>
                    </div>
                  ) : (
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
                          pendingForm
                            ? t('receptionist.form_pending', 'Please complete the step above to continue')
                            : t('receptionist.placeholder')
                        }
                        disabled={busy || !!pendingForm}
                        className="flex-1 rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-60"
                      />
                      <button
                        type="submit"
                        disabled={!draft.trim() || busy || !!pendingForm}
                        className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        ↑
                      </button>
                    </form>
                  )}
                </div>
              </>
            )}
          </div>

          {phase === 'chat' && (
            <p className="mt-4 text-center text-xs text-muted">
              <Link to="/account" className="text-brand underline-offset-2 hover:underline">
                {t('receptionist.records_link', 'View my appointments & prescriptions')}
              </Link>
            </p>
          )}

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
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isBot ? 'md-content bg-brand/8 text-ink' : 'whitespace-pre-wrap bg-brand text-white',
        ].join(' ')}
      >
        {/* Assistant replies render markdown (escaped first, so injection-safe);
            the patient's own messages stay literal text. */}
        {isBot ? (
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
        ) : (
          text
        )}
      </div>
    </div>
  );
}

