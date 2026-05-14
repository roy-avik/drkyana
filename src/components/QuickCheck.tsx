import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import { WHATSAPP_LINK } from './Contact';

type AvailabilityState = 'checking' | 'available' | 'downloadable' | 'downloading' | 'unavailable';
type Urgency = 'routine' | 'soon' | 'urgent';
type Category = 'scaling' | 'rct' | 'general';

type Triage = { urgency: Urgency; category: Category; reason: string };

type LanguageModelMonitor = { addEventListener: (event: 'downloadprogress', listener: (e: Event & { loaded?: number }) => void) => void };
type LanguageModelSession = { prompt: (input: string) => Promise<string> };
type LanguageModelType = {
  availability: (config: object) => Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>;
  create: (config: object) => Promise<LanguageModelSession>;
};

declare global {
  interface Window { LanguageModel?: LanguageModelType }
}

const SYSTEM_PROMPT = `You are a conservative dental-triage assistant for Dr Kyana's website. Reply with JSON only: {"urgency":"routine"|"soon"|"urgent","category":"scaling"|"rct"|"general","reason":"<=25 English words"}. Never diagnose, never suggest medication or dosages. Default to "soon" if uncertain. Use "urgent" only for severe or persistent pain, swelling, trauma, unstoppable bleeding, or facial fever.`;

let session: LanguageModelSession | null = null;

export function QuickCheckBody() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<AvailabilityState>('checking');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [triage, setTriage] = useState<Triage | null>(null);
  const [error, setError] = useState(false);
  const whatsappBase = useMemo(() => WHATSAPP_LINK, []);

  useEffect(() => { void check(); }, []);

  async function check() {
    if (!window.LanguageModel) return setStatus('unavailable');
    try {
      const availability = await window.LanguageModel.availability({
        expectedInputs: [{ type: 'text', languages: ['en', 'fa', 'bn'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      });
      setStatus(availability);
    } catch {
      setStatus('unavailable');
    }
  }

  async function ensureSession() {
    if (session) return session;
    if (!window.LanguageModel) throw new Error('unavailable');
    setStatus('downloading');
    const s = await window.LanguageModel.create({
      expectedInputs: [{ type: 'text', languages: ['en', 'fa', 'bn'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
      temperature: 0.2,
      topK: 3,
      initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }],
      monitor(m: LanguageModelMonitor) {
        m.addEventListener('downloadprogress', (e) => setProgress(Math.round((e.loaded ?? 0) * 100)));
      },
    });
    session = s;
    setStatus('available');
    return s;
  }

  async function onRun() {
    setLoading(true); setError(false);
    try {
      const s = await ensureSession();
      const raw = await s.prompt(input.trim().slice(0, 300));
      const parsed = JSON.parse(raw) as Triage;
      if (!['routine', 'soon', 'urgent'].includes(parsed.urgency) || !['scaling', 'rct', 'general'].includes(parsed.category)) throw new Error();
      setTriage(parsed);
    } catch {
      setError(true);
      setTriage(null);
    } finally { setLoading(false); }
  }

  const message = `Hello Dr Kyana — ${input.trim().slice(0, 300)}.\nAI quick check: ${triage ? `${t(`quickCheck.urgency.${triage.urgency}`)} / ${t(`quickCheck.category.${triage.category}`)}` : t('quickCheck.error')}.`;
  const waHref = `${whatsappBase}?text=${encodeURIComponent(message)}`;

  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">{t('quickCheck.title')}</h2>
      <p className="mt-3 text-sm text-muted md:text-base">{t('quickCheck.subtitle')}</p>
      <p className="mt-5 rounded-xl bg-surface-alt p-3 text-sm text-muted">{t('quickCheck.disclaimer')}</p>
      {status === 'unavailable' ? (
        <p className="mt-6 rounded-xl border border-brand/20 bg-brand/5 p-4 text-sm text-brand">
          {t('quickCheck.fallback')}{' '}
          <a href={whatsappBase} target="_blank" rel="noreferrer" className="font-semibold underline">WhatsApp</a>
        </p>
      ) : (
        <>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('quickCheck.placeholder')}
            className="mt-6 min-h-28 w-full rounded-2xl border border-ink/10 bg-white p-4 text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <button
            type="button"
            disabled={loading || status === 'downloading' || !input.trim()}
            onClick={() => void onRun()}
            className="btn-primary mt-4 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:bg-brand disabled:hover:shadow-none"
          >
            {loading || status === 'downloading'
              ? `${t('quickCheck.button.loading')} ${progress ? `(${progress}%)` : ''}`
              : status === 'downloadable'
                ? t('quickCheck.button.preparing')
                : t('quickCheck.button.ready')}
          </button>
          {(triage || error) && (
            <div className="mt-6 rounded-2xl bg-surface-alt p-5 ring-1 ring-ink/5">
              {triage ? (
                <>
                  <p>
                    <span className={`qc-badge qc-badge--${triage.urgency}`}>{t(`quickCheck.urgency.${triage.urgency}`)}</span>
                  </p>
                  <p className="mt-3 font-semibold">{t(`quickCheck.category.${triage.category}`)}</p>
                  <p className="mt-2 text-sm text-muted">{triage.reason}</p>
                </>
              ) : (
                <p className="text-sm text-muted">{t('quickCheck.error')}</p>
              )}
              <a href={waHref} target="_blank" rel="noreferrer" className="btn-ghost mt-4">{t('quickCheck.cta')}</a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
