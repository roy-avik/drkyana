import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import {
  generateReply,
  isGeneratorCached,
  isGeneratorReady,
  loadGenerator,
  type ChatTurn,
  type GenProgress,
} from '../services/receptionistGenerator';
import { logIntake } from '../services/receptionistLog';

type Phase =
  | 'standby'
  | 'confirm_download'
  | 'loading'
  | 'load_failed'
  | 'chat'
  | 'generating'
  | 'submitting'
  | 'submitted';

type ChatMsg = { role: 'bot' | 'user'; text: string };

function hasSaveData(): boolean {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return conn?.saveData === true;
}

// Pulls the patient-facing portion out of the model's structured reply.
// Expected shape (see receptionistPrompt.ts):
//   INTENT: <id>
//   SAY: <text to show patient>
// During streaming we may have a partial buffer ending mid-token, so:
//   - If "SAY:" appears, return everything after it (trimmed).
//   - If only "INTENT:" appears so far, return "…" as a placeholder.
//   - If the model freestyles (no markers), return the buffer as-is.
function extractSayLine(raw: string): string {
  const sayIdx = raw.search(/\bSAY:\s*/i);
  if (sayIdx >= 0) {
    return raw.slice(sayIdx).replace(/^\s*SAY:\s*/i, '').trim();
  }
  if (/\bINTENT:\s*/i.test(raw)) return '…';
  return raw.trim();
}

function extractIntent(raw: string): string | null {
  const m = raw.match(/\bINTENT:\s*([A-Za-z_]+)/i);
  return m ? m[1].toLowerCase() : null;
}

export function ReceptionistGenerative({ onFallback }: { onFallback: () => void }) {
  const { t, lang } = useTranslation();

  const [phase, setPhase] = useState<Phase>('standby');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [loadPct, setLoadPct] = useState<number | null>(null);
  const [cached, setCached] = useState<boolean | null>(null);
  const [submitError, setSubmitError] = useState(false);

  const sectionRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Cache probe
  useEffect(() => {
    let alive = true;
    isGeneratorCached().then((hit) => alive && setCached(hit));
    return () => {
      alive = false;
    };
  }, []);

  // Intersection-gated preload (skip on data-saver)
  useEffect(() => {
    if (hasSaveData()) return;
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      kickPreload();
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          kickPreload();
          obs.disconnect();
        }
      },
      { rootMargin: '600px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function kickPreload() {
    loadGenerator((p: GenProgress) => {
      if (typeof p.progress === 'number') setLoadPct(p.progress);
    })
      .then(() => setCached(true))
      .catch(() => {
        // Silent — surfaces on click.
      });
  }

  function onStartChat() {
    if (isGeneratorReady()) {
      setMessages([{ role: 'bot', text: t('receptionist.greeting') }]);
      setPhase('chat');
      return;
    }
    if (hasSaveData() && !cached) {
      setPhase('confirm_download');
      return;
    }
    beginLoad();
  }

  function beginLoad() {
    setPhase('loading');
    loadGenerator((p: GenProgress) => {
      if (typeof p.progress === 'number') setLoadPct(p.progress);
    })
      .then(() => {
        setCached(true);
        setMessages([{ role: 'bot', text: t('receptionist.greeting') }]);
        setPhase('chat');
      })
      .catch(() => setPhase('load_failed'));
  }

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, phase]);

  const send = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (phase !== 'chat') return;

    const next: ChatMsg[] = [...messages, { role: 'user', text: trimmed }, { role: 'bot', text: '' }];
    setMessages(next);
    setDraft('');
    setPhase('generating');

    // Build chat history for the model (skip the initial greeting bubble to
    // avoid confusing the chat template with an unprompted assistant turn).
    const turns: ChatTurn[] = next
      .filter((_, i) => !(i === 0 && next[0].role === 'bot'))
      .filter((m) => m.text.length > 0)
      .map((m) => ({
        role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.text,
      }));

    // The system prompt asks Gemma to reply with two lines:
    //   INTENT: <id>
    //   SAY: <patient-facing text>
    // We accumulate raw tokens in `rawBuffer` and surface only the SAY
    // portion to the bubble. If the model deviates from the format we
    // fall back to showing whatever it produced verbatim.
    let rawBuffer = '';
    try {
      await generateReply(turns, (token: string) => {
        rawBuffer += token;
        const visible = extractSayLine(rawBuffer);
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'bot') {
            updated[updated.length - 1] = { ...last, text: visible };
          }
          return updated;
        });
      });
      const parsedIntent = extractIntent(rawBuffer);
      if (parsedIntent) {
        console.log('[ReceptionistGenerative] intent:', parsedIntent);
      }
      setPhase('chat');
    } catch (err) {
      console.error('[ReceptionistGenerative] inference failed', err);
      // WebGPU shader compile failures (Firefox in particular) only surface
      // at first inference, not at load. Drop the patient into the classifier
      // instead of leaving them stuck on a generic error.
      onFallback();
    }
  }, [draft, messages, phase, t, onFallback]);

  async function submitConversation() {
    setSubmitError(false);
    setPhase('submitting');
    const transcript = messages
      .map((m) => `${m.role === 'user' ? 'Patient' : 'Bot'}: ${m.text}`)
      .join('\n');
    const ok = await logIntake(
      {
        intent: 'other',
        rawPatientText: transcript,
        collected: {},
      },
      lang,
    );
    if (ok) {
      setPhase('submitted');
    } else {
      setSubmitError(true);
      setPhase('chat');
    }
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

          <div className="mt-8 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-ink/5">
            {phase === 'standby' && (
              <div className="flex flex-col items-center gap-5 px-6 py-10 md:py-14">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/8">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7 text-brand">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                  </svg>
                </div>
                <p className="max-w-sm text-center text-sm text-muted">{t('receptionist.privacy')}</p>
                <button type="button" onClick={onStartChat} className="btn-primary px-8 py-3">
                  {t('receptionist.start_button')}
                </button>
                {cached === false && (
                  <p className="max-w-sm text-center text-xs text-muted">
                    {t('receptionist.gen_first_time_hint')}
                  </p>
                )}
              </div>
            )}

            {phase === 'confirm_download' && (
              <div className="flex flex-col items-center gap-4 px-6 py-10 md:py-14">
                <p className="max-w-md text-center text-sm font-semibold text-ink">
                  {t('receptionist.savedata.title')}
                </p>
                <p className="max-w-md text-center text-sm text-muted">
                  {t('receptionist.gen_savedata_message')}
                </p>
                <div className="flex flex-col items-stretch gap-2 sm:flex-row">
                  <button type="button" onClick={beginLoad} className="btn-primary px-6 py-2.5">
                    {t('receptionist.savedata.confirm')}
                  </button>
                  <a
                    href="https://wa.me/8801614369673"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-ink/10 px-6 py-2.5 text-center text-sm text-muted hover:text-ink"
                  >
                    {t('receptionist.savedata.cancel')}
                  </a>
                </div>
              </div>
            )}

            {phase === 'loading' && (
              <div className="flex flex-col items-center gap-4 px-6 py-10 md:py-14">
                <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-ink/10 border-t-brand" />
                <p className="text-sm text-muted">
                  {loadPct !== null && loadPct > 0
                    ? `${t('receptionist.loading')} (${Math.round(loadPct)}%)`
                    : t('receptionist.loading')}
                </p>
                {loadPct !== null && loadPct > 0 && (
                  <div className="h-1.5 w-48 overflow-hidden rounded-full bg-ink/5">
                    <div className="h-full rounded-full bg-brand transition-all duration-300" style={{ width: `${Math.round(loadPct)}%` }} />
                  </div>
                )}
              </div>
            )}

            {phase === 'load_failed' && (
              <div className="flex flex-col items-center gap-4 px-6 py-10 md:py-14">
                <p className="max-w-md text-center text-sm text-ink">
                  {t('receptionist.load_error.message')}
                </p>
                <div className="flex flex-col items-stretch gap-2 sm:flex-row">
                  <button type="button" onClick={beginLoad} className="btn-primary px-6 py-2.5">
                    {t('receptionist.load_error.retry')}
                  </button>
                  <button
                    type="button"
                    onClick={onFallback}
                    className="rounded-full border border-ink/10 px-6 py-2.5 text-center text-sm text-muted hover:text-ink"
                  >
                    {t('receptionist.gen_fallback_label')}
                  </button>
                </div>
              </div>
            )}

            {(phase === 'chat' || phase === 'generating' || phase === 'submitting' || phase === 'submitted') && (
              <>
                <div
                  ref={scrollRef}
                  className="flex max-h-[32rem] flex-col gap-3 overflow-y-auto p-5 md:p-6"
                >
                  {messages.map((m, i) => (
                    <ChatBubble key={i} role={m.role} text={m.text || (phase === 'generating' && i === messages.length - 1 ? '…' : '')} />
                  ))}
                </div>

                <div className="border-t border-ink/5 bg-surface-alt p-4 md:p-5">
                  {phase === 'submitted' ? (
                    <div className="rounded-2xl bg-green-50 p-4 text-center text-sm text-green-800 ring-1 ring-green-200">
                      {t('receptionist.submit.success')}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void send();
                        }}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="text"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          placeholder={t('receptionist.placeholder')}
                          disabled={phase !== 'chat'}
                          className="flex-1 rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-60"
                        />
                        <button
                          type="submit"
                          disabled={!draft.trim() || phase !== 'chat'}
                          className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          ↑
                        </button>
                      </form>
                      {messages.filter((m) => m.role === 'user').length >= 1 && (
                        <button
                          type="button"
                          disabled={phase !== 'chat'}
                          onClick={() => void submitConversation()}
                          className="w-full rounded-full bg-brand/8 px-5 py-2 text-sm font-semibold text-brand transition hover:bg-brand/12 disabled:opacity-50"
                        >
                          {phase === 'submitting' ? '…' : t('receptionist.cta.send')}
                        </button>
                      )}
                      {submitError && (
                        <p className="text-center text-xs text-red-600">{t('receptionist.submit.error')}</p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {phase !== 'standby' && phase !== 'confirm_download' && phase !== 'load_failed' && (
            <p className="mt-4 text-center text-xs text-muted">{t('receptionist.privacy')}</p>
          )}
        </div>
      </div>
    </section>
  );
}

function ChatBubble({ role, text }: { role: 'bot' | 'user'; text: string }) {
  const isBot = role === 'bot';
  return (
    <div className={isBot ? 'flex justify-start' : 'flex justify-end'}>
      <div
        className={[
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
          isBot ? 'bg-brand/8 text-ink' : 'bg-brand text-white',
        ].join(' ')}
      >
        {text}
      </div>
    </div>
  );
}
