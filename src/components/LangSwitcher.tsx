import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import type { Lang } from '../i18n/I18nProvider';

type Option = { code: Lang; native: string; sub: string; rtl?: boolean; fontClass?: string };

const OPTIONS: Option[] = [
  { code: 'en', native: 'English', sub: 'EN' },
  { code: 'fa', native: 'فارسی', sub: 'Persian', rtl: true, fontClass: 'font-[var(--font-fa)]' },
  { code: 'bn', native: 'বাংলা', sub: 'Bengali', fontClass: 'font-[var(--font-bn)]' },
];

export function LangSwitcher() {
  const { lang, setLang } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const current = OPTIONS.find((o) => o.code === lang) ?? OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const idx = OPTIONS.findIndex((o) => o.code === lang);
    requestAnimationFrame(() => itemRefs.current[idx >= 0 ? idx : 0]?.focus());
  }, [open, lang]);

  const handleSelect = (code: Lang) => {
    setLang(code);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    const active = document.activeElement;
    const idx = itemRefs.current.findIndex((el) => el === active);
    const len = OPTIONS.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      itemRefs.current[(idx + 1 + len) % len]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      itemRefs.current[(idx - 1 + len) % len]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      itemRefs.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      itemRefs.current[len - 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const isRtl = lang === 'fa';

  return (
    <div ref={rootRef} className="relative ml-4 font-sans">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Language"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
        className={[
          'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold leading-none transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
          open
            ? 'border-brand/15 bg-brand/10 text-brand'
            : 'border-transparent bg-brand/[0.06] text-brand hover:bg-brand/10',
        ].join(' ')}
      >
        <svg className="h-3.5 w-3.5 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0 -18" />
        </svg>
        <span
          className={current.fontClass}
          dir={current.rtl ? 'rtl' : 'ltr'}
        >
          {current.native}
        </span>
        <svg
          className={`h-2.5 w-2.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <ul
        role="listbox"
        aria-label="Language"
        tabIndex={-1}
        onKeyDown={onMenuKey}
        className={[
          'absolute z-50 mt-2.5 min-w-[12rem] origin-top rounded-2xl border border-ink/5 bg-white/95 p-1.5 shadow-pop backdrop-blur-md backdrop-saturate-150',
          'transition duration-150 ease-out',
          isRtl ? 'left-0 origin-top-left' : 'right-0 origin-top-right',
          open
            ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
            : 'opacity-0 -translate-y-1 scale-[0.97] pointer-events-none',
        ].join(' ')}
      >
        {OPTIONS.map((opt, i) => {
          const selected = opt.code === lang;
          return (
            <li key={opt.code} role="option" aria-selected={selected}>
              <button
                ref={(el) => { itemRefs.current[i] = el; }}
                type="button"
                tabIndex={-1}
                onClick={() => handleSelect(opt.code)}
                className={[
                  'flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-start text-sm transition-colors',
                  selected
                    ? 'bg-accent/[0.08] text-brand'
                    : 'text-ink hover:bg-brand/[0.07] hover:text-brand focus-visible:bg-brand/[0.07] focus-visible:text-brand',
                  'focus-visible:outline-none',
                ].join(' ')}
                aria-selected={selected}
              >
                <span className={`flex-1 font-semibold leading-tight ${opt.fontClass ?? ''}`}>
                  {opt.native}
                </span>
                <span className="text-[0.7rem] font-normal tracking-wide text-muted">{opt.sub}</span>
                <svg
                  className={`h-3.5 w-3.5 text-accent transition-all duration-150 ${selected ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

