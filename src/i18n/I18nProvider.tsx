import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { parseYaml } from './parseYaml';
import enYamlRaw from '../../public/locales/en.yaml?raw';

export type Lang = 'en' | 'fa' | 'bn';
export const LANGS: Lang[] = ['en', 'fa', 'bn'];

const STORAGE_KEY = 'drkyana.lang';

type Dict = Record<string, string>;

type I18nValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, fallback?: string) => string;
  ready: boolean;
};

export const I18nContext = createContext<I18nValue | null>(null);

function detectInitial(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'fa' || stored === 'bn') return stored;
  } catch {}
  const nav = (navigator.language || 'en').toLowerCase();
  if (nav.startsWith('fa')) return 'fa';
  if (nav.startsWith('bn')) return 'bn';
  return 'en';
}

const cache = new Map<Lang, Dict>();
cache.set('en', parseYaml(enYamlRaw));

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectInitial());
  const [dict, setDict] = useState<Dict>(() => cache.get(detectInitial()) ?? {});
  const [ready, setReady] = useState<boolean>(() => cache.has(lang));

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (cache.has(lang)) {
        setDict(cache.get(lang)!);
        setReady(true);
        return;
      }
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}locales/${lang}.yaml`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const parsed = parseYaml(text);
        cache.set(lang, parsed);
        if (!cancelled) {
          setDict(parsed);
          setReady(true);
        }
      } catch (err) {
        console.error('Failed to load locale', lang, err);
        if (!cancelled) setReady(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [lang]);

  // Mirror language onto <html> for font swapping & a11y.
  // dir is intentionally kept ltr — the layout stays the same for all languages;
  // Farsi characters are intrinsically RTL via Unicode bidi so they render correctly.
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = 'ltr';
  }, [lang]);

  // Reveal page once first locale resolves.
  useEffect(() => {
    if (ready) document.body.classList.add('is-ready');
    else document.body.classList.remove('is-ready');
  }, [ready]);

  // Sync <title> and meta description when dict updates.
  useEffect(() => {
    if (dict['meta.title']) document.title = dict['meta.title'];
    const meta = document.querySelector('meta[name="description"]');
    if (meta && dict['meta.description']) {
      meta.setAttribute('content', dict['meta.description']);
    }
  }, [dict]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch {}
  }, []);

  const t = useCallback(
    (key: string, fallback?: string) => dict[key] ?? fallback ?? key,
    [dict],
  );

  const value = useMemo<I18nValue>(() => ({ lang, setLang, t, ready }), [lang, setLang, t, ready]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
