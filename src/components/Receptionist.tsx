import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import {
  classify,
  loadClassifier,
  type LoadProgress,
} from '../services/intentClassifier';
import { findIntent, type IntentId } from '../services/intents';
import {
  INTAKE_GROUPS,
  getGroupsForFlow,
  localizeOption,
  type IntakeGroup,
  type IntakeSlot,
} from '../services/intakeSchema';
import { assessTriage, triageColor, type TriageResult } from '../services/triage';
import { buildWhatsAppHref, type IntakeData } from '../services/whatsapp';
import { logIntake } from '../services/receptionistLog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase =
  | 'idle'
  | 'loading'
  | 'classifying'
  | 'consent'
  | 'asking_slot'
  | 'reviewing'
  | 'done';

type ChatMsg = { role: 'bot' | 'user'; text: string };

const CLINICAL_INTENTS = new Set<IntentId>([
  'book_appointment', 'urgent',
]);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function Receptionist() {
  const { t, lang, ready } = useTranslation();

  // Core state
  const [phase, setPhase] = useState<Phase>('idle');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [loadPct, setLoadPct] = useState<number | null>(null);
  const [intent, setIntent] = useState<IntentId | null>(null);
  const [rawPatientText, setRawPatientText] = useState('');

  // Intake flow
  const [groups, setGroups] = useState<IntakeGroup[]>(INTAKE_GROUPS);
  const [groupIdx, setGroupIdx] = useState(0);
  const [slotIdx, setSlotIdx] = useState(0);
  const [collected, setCollected] = useState<Record<string, string | string[]>>({});
  const [multiSelectPending, setMultiSelectPending] = useState<Set<string>>(new Set());

  // Triage
  const [triage, setTriage] = useState<TriageResult | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Greeting on mount
  useEffect(() => {
    if (ready) {
      setMessages([{ role: 'bot', text: t('receptionist.greeting') }]);
    }
  }, [ready, t]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, phase, slotIdx]);

  function append(...msgs: ChatMsg[]) {
    setMessages((prev) => [...prev, ...msgs]);
  }

  // -----------------------------------------------------------------------
  // Phase: idle → loading → classifying
  // -----------------------------------------------------------------------

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

    const classifiedIntent = result.intent;
    setIntent(classifiedIntent);
    const def = findIntent(classifiedIntent);

    if (def.kind === 'booking' || CLINICAL_INTENTS.has(classifiedIntent)) {
      append({ role: 'bot', text: t(`receptionist.intent.${classifiedIntent}.response`) });
      enterConsent(classifiedIntent);
    } else {
      // Non-clinical — one-shot response + WhatsApp CTA
      append({ role: 'bot', text: t(`receptionist.intent.${classifiedIntent}.response`) });
      setPhase('done');
    }
  }

  function finishWithFallback(text: string) {
    setIntent('other');
    append({ role: 'bot', text: t('receptionist.intent.other.response') });
    setPhase('done');
    setRawPatientText(text);
  }

  // -----------------------------------------------------------------------
  // Phase: consent gate
  // -----------------------------------------------------------------------

  function enterConsent(_currentIntent: IntentId) {
    append({ role: 'bot', text: t('intake.consent.message') });
    setPhase('consent');
  }

  function acceptConsent() {
    append({ role: 'user', text: t('intake.consent.accept') });
    startIntake();
  }

  // -----------------------------------------------------------------------
  // Phase: intake slot-filling
  // -----------------------------------------------------------------------

  const startIntake = useCallback(() => {
    const flowGroups = getGroupsForFlow(intent!, collected.visit_type as string | undefined);
    setGroups(flowGroups);
    setGroupIdx(0);
    setSlotIdx(0);

    const firstGroup = flowGroups[0];
    if (firstGroup) {
      append({ role: 'bot', text: t(`intake.group.${firstGroup.id}.intro`) });
      append({ role: 'bot', text: t(`intake.slot.${firstGroup.slots[0].id}.ask`) });
      setPhase('asking_slot');
    }
  }, [intent, collected, t]);

  function currentSlot(): IntakeSlot | null {
    const group = groups[groupIdx];
    if (!group) return null;
    return group.slots[slotIdx] ?? null;
  }

  function advanceSlot() {
    const group = groups[groupIdx];
    if (!group) return;

    const nextSlotIdx = slotIdx + 1;
    if (nextSlotIdx < group.slots.length) {
      // Next slot in same group
      setSlotIdx(nextSlotIdx);
      const nextSlot = group.slots[nextSlotIdx];
      append({ role: 'bot', text: t(`intake.slot.${nextSlot.id}.ask`) });
      return;
    }

    // Run triage after complaint group
    if (group.id === 'complaint') {
      const triageResult = assessTriage({
        symptoms: collected.symptoms as string[] | undefined,
        severity: collected.severity ? Number(collected.severity) : undefined,
        duration: collected.duration as string | undefined,
        triggers: collected.triggers as string[] | undefined,
      });
      setTriage(triageResult);

      if (triageResult.action === 'fast_track') {
        append({ role: 'bot', text: t('intake.triage.red_message') });
        setPhase('reviewing');
        append({ role: 'bot', text: t('intake.review.message') });
        return;
      }
    }

    // Next group
    const nextGroupIdx = groupIdx + 1;
    if (nextGroupIdx < groups.length) {
      const nextGroup = groups[nextGroupIdx];
      // Check group condition
      const ctx = { intent: intent!, visitType: collected.visit_type as string | undefined, collectedSlots: collected };
      if (nextGroup.condition && !nextGroup.condition(ctx)) {
        // Skip this group
        setGroupIdx(nextGroupIdx);
        setSlotIdx(0);
        // Recurse to find the next valid group
        advanceToNextValidGroup(nextGroupIdx + 1);
        return;
      }

      setGroupIdx(nextGroupIdx);
      setSlotIdx(0);
      append({ role: 'bot', text: t(`intake.group.${nextGroup.id}.intro`) });
      append({ role: 'bot', text: t(`intake.slot.${nextGroup.slots[0].id}.ask`) });
      return;
    }

    // All groups done → review
    setPhase('reviewing');
    append({ role: 'bot', text: t('intake.review.message') });
  }

  function advanceToNextValidGroup(startIdx: number) {
    const ctx = { intent: intent!, visitType: collected.visit_type as string | undefined, collectedSlots: collected };
    for (let i = startIdx; i < groups.length; i++) {
      const g = groups[i];
      if (!g.condition || g.condition(ctx)) {
        setGroupIdx(i);
        setSlotIdx(0);
        append({ role: 'bot', text: t(`intake.group.${g.id}.intro`) });
        append({ role: 'bot', text: t(`intake.slot.${g.slots[0].id}.ask`) });
        return;
      }
    }
    // No more groups
    setPhase('reviewing');
    append({ role: 'bot', text: t('intake.review.message') });
  }

  function submitSingleSelect(slotId: string, value: { id: string; label: string }) {
    setCollected((prev) => ({ ...prev, [slotId]: value.id }));
    append({ role: 'user', text: value.label });
    advanceSlot();
  }

  function submitMultiSelect(slotId: string, selectedIds: string[], label: string) {
    setCollected((prev) => ({ ...prev, [slotId]: selectedIds }));
    setMultiSelectPending(new Set());
    append({ role: 'user', text: label });
    advanceSlot();
  }

  function submitFreetext(slotId: string, value: string) {
    setCollected((prev) => ({ ...prev, [slotId]: value }));
    append({ role: 'user', text: value });
    setDraft('');
    advanceSlot();
  }

  function submitNumberChip(slotId: string, value: number) {
    setCollected((prev) => ({ ...prev, [slotId]: String(value) }));
    append({ role: 'user', text: String(value) });
    advanceSlot();
  }

  function skipSlot() {
    append({ role: 'user', text: t('intake.skip') });
    advanceSlot();
  }

  // -----------------------------------------------------------------------
  // WhatsApp href
  // -----------------------------------------------------------------------

  const intakeData: IntakeData = useMemo(() => ({
    intent: intent ?? 'other',
    rawPatientText,
    collected,
    triage: triage ?? undefined,
  }), [intent, rawPatientText, collected, triage]);

  const waHref = useMemo(() => {
    if (!intent) return '';
    return buildWhatsAppHref(intakeData);
  }, [intent, intakeData]);

  // -----------------------------------------------------------------------
  // Progress
  // -----------------------------------------------------------------------

  const totalSlots = groups.reduce((sum, g) => sum + g.slots.length, 0);
  const completedSlots = groups
    .slice(0, groupIdx)
    .reduce((sum, g) => sum + g.slots.length, 0) + slotIdx;
  const progress = totalSlots > 0 ? completedSlots / totalSlots : 0;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

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
            {/* Progress bar */}
            {phase === 'asking_slot' && (
              <div className="h-1 bg-ink/5">
                <div
                  className="h-full bg-brand transition-all duration-500"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            )}

            {/* Chat messages */}
            <div
              ref={scrollRef}
              className="flex max-h-[32rem] flex-col gap-3 overflow-y-auto p-5 md:p-6"
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

            {/* Input area */}
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

              {phase === 'consent' && (
                <ConsentGate
                  onAccept={acceptConsent}
                  onEscape={() => {
                    setPhase('done');
                  }}
                  acceptLabel={t('intake.consent.accept')}
                  escapeLabel={t('intake.escape')}
                />
              )}

              {phase === 'asking_slot' && currentSlot() && (
                <SlotInputRouter
                  slot={currentSlot()!}
                  lang={lang}
                  draft={draft}
                  setDraft={setDraft}
                  multiSelectPending={multiSelectPending}
                  setMultiSelectPending={setMultiSelectPending}
                  onSubmitSingle={(v) => submitSingleSelect(currentSlot()!.id, v)}
                  onSubmitMulti={(ids, label) => submitMultiSelect(currentSlot()!.id, ids, label)}
                  onSubmitFreetext={(v) => submitFreetext(currentSlot()!.id, v)}
                  onSubmitNumber={(v) => submitNumberChip(currentSlot()!.id, v)}
                  onSkip={currentSlot()!.skippable ? skipSlot : undefined}
                  skipLabel={t('intake.skip_button')}
                />
              )}

              {phase === 'reviewing' && (
                <IntakeReview
                  collected={collected}
                  triage={triage}
                  waHref={waHref}
                  onSend={() => { logIntake(intakeData, lang); setPhase('done'); }}
                  lang={lang}
                  sendLabel={t('receptionist.cta.send')}
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
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isBot ? 'bg-brand/8 text-ink' : 'bg-brand text-white',
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
      onSubmit={(e) => { e.preventDefault(); onSend(); }}
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

function ConsentGate({
  onAccept,
  onEscape,
  acceptLabel,
  escapeLabel,
}: {
  onAccept: () => void;
  onEscape: () => void;
  acceptLabel: string;
  escapeLabel: string;
}) {
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onAccept}
        className="btn-primary w-full"
      >
        {acceptLabel}
      </button>
      <button
        type="button"
        onClick={onEscape}
        className="block w-full text-center text-xs text-muted underline hover:text-ink"
      >
        {escapeLabel}
      </button>
    </div>
  );
}

function SlotInputRouter({
  slot,
  lang,
  draft,
  setDraft,
  multiSelectPending,
  setMultiSelectPending,
  onSubmitSingle,
  onSubmitMulti,
  onSubmitFreetext,
  onSubmitNumber,
  onSkip,
  skipLabel,
}: {
  slot: IntakeSlot;
  lang: string;
  draft: string;
  setDraft: (s: string) => void;
  multiSelectPending: Set<string>;
  setMultiSelectPending: (s: Set<string>) => void;
  onSubmitSingle: (v: { id: string; label: string }) => void;
  onSubmitMulti: (ids: string[], label: string) => void;
  onSubmitFreetext: (v: string) => void;
  onSubmitNumber: (v: number) => void;
  onSkip?: () => void;
  skipLabel: string;
}) {
  const placeholder = slot.placeholder ? localizeOption(slot.placeholder, lang) : '';

  if (slot.type === 'single_select' && slot.options) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {slot.options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSubmitSingle({ id: opt.id, label: localizeOption(opt, lang) })}
              className="rounded-full border border-brand/20 bg-white px-4 py-2 text-sm font-medium text-brand transition hover:-translate-y-0.5 hover:bg-brand/5"
            >
              {localizeOption(opt, lang)}
            </button>
          ))}
        </div>
        {onSkip && <SkipButton label={skipLabel} onClick={onSkip} />}
      </div>
    );
  }

  if (slot.type === 'multi_select' && slot.options) {
    const toggle = (id: string) => {
      const next = new Set(multiSelectPending);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // "None" deselects everything else; selecting anything deselects "none"
      if (id === 'none') {
        next.clear();
        next.add('none');
      } else {
        next.delete('none');
      }
      setMultiSelectPending(next);
    };

    const selected = Array.from(multiSelectPending);
    const label = selected
      .map((id) => {
        const opt = slot.options!.find((o) => o.id === id);
        return opt ? localizeOption(opt, lang) : id;
      })
      .join(', ');

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {slot.options.map((opt) => {
            const isSelected = multiSelectPending.has(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggle(opt.id)}
                className={[
                  'rounded-full border px-4 py-2 text-sm font-medium transition',
                  isSelected
                    ? 'border-brand bg-brand text-white'
                    : 'border-brand/20 bg-white text-brand hover:-translate-y-0.5 hover:bg-brand/5',
                ].join(' ')}
              >
                {localizeOption(opt, lang)}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={selected.length === 0}
          onClick={() => onSubmitMulti(selected, label)}
          className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Done
        </button>
      </div>
    );
  }

  if (slot.type === 'number_chips' && slot.numberRange) {
    const { min, max, labels } = slot.numberRange;
    const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap gap-2">
          {nums.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onSubmitNumber(n)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-brand/20 bg-white text-sm font-medium text-brand transition hover:-translate-y-0.5 hover:bg-brand/5"
            >
              {n}
            </button>
          ))}
        </div>
        {labels && (
          <div className="flex justify-between px-1 text-[10px] text-muted">
            {Object.entries(labels).map(([n, lbl]) => (
              <span key={n}>{n}={localizeOption(lbl, lang)}</span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // freetext or phone
  return (
    <div className="space-y-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          onSubmitFreetext(draft.trim());
        }}
        className="flex items-center gap-2"
      >
        <input
          type={slot.type === 'phone' ? 'tel' : 'text'}
          inputMode={slot.type === 'phone' ? 'tel' : 'text'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          ↑
        </button>
        {onSkip && <SkipButton label={skipLabel} onClick={onSkip} />}
      </form>
    </div>
  );
}

function SkipButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-ink/10 px-4 py-2 text-sm text-muted hover:text-ink"
    >
      {label}
    </button>
  );
}

function IntakeReview({
  collected,
  triage,
  waHref,
  onSend,
  lang,
  sendLabel,
}: {
  collected: Record<string, string | string[]>;
  triage: TriageResult | null;
  waHref: string;
  onSend: () => void;
  lang: string;
  sendLabel: string;
}) {
  const reviewFields = Object.entries(collected).filter(([, v]) => {
    if (Array.isArray(v)) return v.length > 0;
    return !!v;
  });

  return (
    <div className="space-y-3">
      {triage && (
        <div className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${triageColor(triage.level)}`}>
          {localizeOption(triage.label, lang)}
        </div>
      )}
      <dl className="max-h-48 overflow-y-auto rounded-2xl bg-white p-4 text-sm ring-1 ring-ink/5">
        {reviewFields.map(([key, val]) => (
          <div key={key} className="flex items-baseline justify-between gap-3 py-1">
            <dt className="text-xs uppercase tracking-wider text-muted">{key.replace(/_/g, ' ')}</dt>
            <dd className="text-right text-ink">{Array.isArray(val) ? val.join(', ') : val}</dd>
          </div>
        ))}
      </dl>
      <a
        href={waHref}
        target="_blank"
        rel="noreferrer"
        onClick={onSend}
        className={[
          'block w-full rounded-full px-6 py-3 text-center text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5',
          triage?.level === 'RED'
            ? 'bg-red-600 text-white hover:bg-red-700 hover:shadow-lg hover:shadow-red-600/30'
            : 'bg-brand text-white hover:bg-brand-dark hover:shadow-lg hover:shadow-brand/25',
        ].join(' ')}
      >
        {sendLabel}
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
