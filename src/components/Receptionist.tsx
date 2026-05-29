import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useTranslation } from '../i18n/useTranslation';
import { WHATSAPP_LINK } from './Contact';

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

  const { messages, sendMessage, status, error } = useChat({
    id: sessionId,
    transport,
  });

  const busy = status === 'submitted' || status === 'streaming';

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
                  {status === 'submitted' && (
                    <ChatBubble role="assistant" text={t('receptionist.thinking')} />
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
                      placeholder={t('receptionist.placeholder')}
                      disabled={busy}
                      className="flex-1 rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-60"
                    />
                    <button
                      type="submit"
                      disabled={!draft.trim() || busy}
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
