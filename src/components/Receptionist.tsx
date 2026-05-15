import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import {
  classify,
  loadClassifier,
  type LoadProgress,
} from '../services/intentClassifier';
import { BOOKING_SLOTS, findIntent, type IntentId } from '../services/intents';
import { buildWhatsAppHref, type BookingSlots } from '../services/whatsapp';

type Phase = 'idle' | 'loading' | 'classifying' | 'asking_slot' | 'reviewing' | 'done';
type ChatMsg = { role: 'bot' | 'user'; text: string };

export function Receptionist() {
  const { t, ready } = useTranslation();
  const [phase, setPhase] = useState<Phase>('idle');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [loadPct, setLoadPct] = useState<number | null>(null);
  const [intent, setIntent] = useState<IntentId | null>(null);
  const [rawPatientText, setRawPatientText] = useState('');
  const [slots, setSlots] = useState<BookingSlots>({});
  const [slotIdx, setSlotIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ready) {
      setMessages([{ role: 'bot', text: t('receptionist.greeting') }]);
    }
  }, [ready, t]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, phase]);

  function append(...msgs: ChatMsg[]) {
    setMessages((prev) => [...prev, ...msgs]);
  }

  async function onFirstSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    append({ role: 'user', text: trimmed });
    setDraft('');
    setRawPatientText(trimmed);
    setPhase('loading');

    try {
      await loadClassifier((p: LoadProgress) => {
        if (typeof p.progress === 'number') setLoadPct(p.progress);
      });
    } catch (err) {
      console.error('classifier load failed', err);
      finishWithFallback(trimmed);
      return;
    }

    setPhase('classifying');
    let result;
    try {
      result = await classify(trimmed);
    } catch (err) {
      console.error('classify failed', err);
      finishWithFallback(trimmed);
      return;
    }

    setIntent(result.intent);
    const def = findIntent(result.intent);

    if (def.kind === 'booking') {
      append({ role: 'bot', text: t('receptionist.intent.book_appointment.response') });
      askSlot(0);
    } else {
      append({ role: 'bot', text: t(`receptionist.intent.${result.intent}.response`) });
      setPhase('done');
    }
  }

  function finishWithFallback(text: string) {
    setIntent('other');
    append({ role: 'bot', text: t('receptionist.intent.other.response') });
    setPhase('done');
    setRawPatientText(text);
  }

  function askSlot(idx: number) {
    if (idx >= BOOKING_SLOTS.length) {
      // All slots filled — move to review.
      setPhase('reviewing');
      append({ role: 'bot', text: t('receptionist.booking.review') });
      return;
    }
    const slot = BOOKING_SLOTS[idx];
    append({ role: 'bot', text: t(`receptionist.booking.ask.${slot.id}`) });
    setSlotIdx(idx);
    setPhase('asking_slot');
  }

  function submitSlot(value: { id?: string; label: string }) {
    const slot = BOOKING_SLOTS[slotIdx];
    setSlots((prev) => ({ ...prev, [slot.id]: value.id ?? value.label }));
    append({ role: 'user', text: value.label });
    askSlot(slotIdx + 1);
  }

  function skipSlot() {
    const slot = BOOKING_SLOTS[slotIdx];
    if (slot.id !== 'note') return; // only note is skippable
    append({ role: 'user', text: t('receptionist.booking.skip') });
    askSlot(slotIdx + 1);
  }

  const waHref = useMemo(() => {
    if (!intent) return '';
    return buildWhatsAppHref(intent, rawPatientText, slots);
  }, [intent, rawPatientText, slots]);

  return (
    <section id="receptionist" className="py-16 md:py-24">
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
            <div
              ref={scrollRef}
              className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto p-5 md:p-6"
            >
              {messages.map((m, i) => (
                <ChatBubble key={i} role={m.role} text={m.text} />
              ))}
              {phase === 'loading' && (
                <ChatBubble
                  role="bot"
                  text={
                    loadPct !== null && loadPct > 0
                      ? `${t('receptionist.loading')} (${Math.round(loadPct * 100)}%)`
                      : t('receptionist.loading')
                  }
                />
              )}
              {phase === 'classifying' && (
                <ChatBubble role="bot" text={t('receptionist.thinking')} />
              )}
            </div>

            <div className="border-t border-ink/5 bg-surface-alt p-4 md:p-5">
              {phase === 'idle' && (
                <ChatInput
                  value={draft}
                  onChange={setDraft}
                  onSend={() => void onFirstSend(draft)}
                  placeholder={t('receptionist.placeholder')}
                />
              )}

              {(phase === 'loading' || phase === 'classifying') && (
                <div className="h-12 animate-pulse rounded-2xl bg-ink/5" />
              )}

              {phase === 'asking_slot' && (
                <SlotInput
                  slotIdx={slotIdx}
                  onSubmit={submitSlot}
                  onSkip={skipSlot}
                  draft={draft}
                  setDraft={setDraft}
                />
              )}

              {phase === 'reviewing' && (
                <BookingReview
                  slots={slots}
                  waHref={waHref}
                  onSend={() => setPhase('done')}
                />
              )}

              {phase === 'done' && intent && (
                <ResponseCta
                  intent={intent}
                  waHref={waHref}
                />
              )}
            </div>
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

function ChatBubble({ role, text }: { role: 'bot' | 'user'; text: string }) {
  const isBot = role === 'bot';
  return (
    <div className={isBot ? 'flex justify-start' : 'flex justify-end'}>
      <div
        className={[
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
          isBot
            ? 'bg-brand/8 text-ink'
            : 'bg-brand text-white',
        ].join(' ')}
      >
        {text}
      </div>
    </div>
  );
}

function ChatInput({
  value,
  onChange,
  onSend,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  placeholder: string;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
      className="flex items-center gap-2"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        ↑
      </button>
    </form>
  );
}

function SlotInput({
  slotIdx,
  onSubmit,
  onSkip,
  draft,
  setDraft,
}: {
  slotIdx: number;
  onSubmit: (v: { id?: string; label: string }) => void;
  onSkip: () => void;
  draft: string;
  setDraft: (s: string) => void;
}) {
  const { t, lang } = useTranslation();
  const slot = BOOKING_SLOTS[slotIdx];
  const localized = (opt: { id: string; en: string; bn: string; fa: string }) =>
    lang === 'bn' ? opt.bn : lang === 'fa' ? opt.fa : opt.en;

  return (
    <div className="space-y-3">
      {slot.options && (
        <div className="flex flex-wrap gap-2">
          {slot.options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSubmit({ id: opt.id, label: localized(opt) })}
              className="rounded-full border border-brand/20 bg-white px-4 py-2 text-sm font-medium text-brand transition hover:-translate-y-0.5 hover:bg-brand/5"
            >
              {localized(opt)}
            </button>
          ))}
        </div>
      )}
      {slot.freetext && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            onSubmit({ label: draft.trim() });
            setDraft('');
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t(`receptionist.booking.placeholder.${slot.id}`)}
            className="flex-1 rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            ↑
          </button>
          {slot.id === 'note' && (
            <button
              type="button"
              onClick={onSkip}
              className="rounded-full border border-ink/10 px-4 py-2 text-sm text-muted hover:text-ink"
            >
              {t('receptionist.booking.skipButton')}
            </button>
          )}
        </form>
      )}
    </div>
  );
}

function BookingReview({
  slots,
  waHref,
  onSend,
}: {
  slots: BookingSlots;
  waHref: string;
  onSend: () => void;
}) {
  const { t, lang } = useTranslation();
  const visitType = BOOKING_SLOTS[0].options?.find((o) => o.id === slots.visit_type);
  const time = BOOKING_SLOTS[1].options?.find((o) => o.id === slots.preferred_time);
  const localized = (opt?: { en: string; bn: string; fa: string }) =>
    opt ? (lang === 'bn' ? opt.bn : lang === 'fa' ? opt.fa : opt.en) : '';

  return (
    <div className="space-y-3">
      <dl className="rounded-2xl bg-white p-4 text-sm ring-1 ring-ink/5">
        {slots.visit_type && (
          <Row label={t('receptionist.booking.label.visit_type')} value={visitType ? localized(visitType) : slots.visit_type} />
        )}
        {slots.preferred_time && (
          <Row label={t('receptionist.booking.label.preferred_time')} value={time ? localized(time) : slots.preferred_time} />
        )}
        {slots.name && <Row label={t('receptionist.booking.label.name')} value={slots.name} />}
        {slots.note && <Row label={t('receptionist.booking.label.note')} value={slots.note} />}
      </dl>
      <a
        href={waHref}
        target="_blank"
        rel="noreferrer"
        onClick={onSend}
        className="btn-primary w-full"
      >
        {t('receptionist.cta.send')}
      </a>
    </div>
  );
}

function ResponseCta({ intent, waHref }: { intent: IntentId; waHref: string }) {
  const { t } = useTranslation();
  const def = findIntent(intent);
  const urgent = def.severity === 'urgent';
  return (
    <a
      href={waHref}
      target="_blank"
      rel="noreferrer"
      className={[
        'block w-full rounded-full px-6 py-3 text-center text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5',
        urgent
          ? 'bg-red-600 text-white hover:bg-red-700 hover:shadow-lg hover:shadow-red-600/30'
          : 'bg-brand text-white hover:bg-brand-dark hover:shadow-lg hover:shadow-brand/25',
      ].join(' ')}
    >
      {urgent ? t('receptionist.cta.urgent') : t('receptionist.cta.send')}
    </a>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-xs uppercase tracking-wider text-muted">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  );
}
