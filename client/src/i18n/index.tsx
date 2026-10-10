import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Language } from '../../../shared/validation';
import { en, type MessageKey } from './en';
import { es } from './es';
import { interpolate, type Vars } from './interpolate';

const DICTIONARIES = { en, es } as const;
const STORAGE_KEY = 'pw.lang';

interface I18nValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: MessageKey, vars?: Vars) => string;
  /** Picks `${key}.one` or `${key}.other` by plural rules. */
  tn: (key: 'results.count', count: number, vars?: Vars) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'es') return stored;
  } catch {
    // storage unavailable (private mode): fall through
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Language }) {
  const [lang, setLangState] = useState<Language>(() => initial ?? initialLanguage());

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<I18nValue>(() => {
    const dict = DICTIONARIES[lang];
    const plural = new Intl.PluralRules(lang);
    const t = (key: MessageKey, vars?: Vars) => interpolate(dict[key] ?? en[key], vars);
    return {
      lang,
      setLang,
      t,
      tn: (key, count, vars) =>
        t(`${key}.${plural.select(count) === 'one' ? 'one' : 'other'}` as MessageKey, { count, ...vars }),
    };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}
