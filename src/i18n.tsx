import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  createTranslator,
  resolveLocale,
  type LocaleId,
} from "./lib/i18n";
import { I18nContext, type I18nContextValue } from "./i18nContext";

const STORAGE_KEY = "neurotrail.locale";

function initialLocale() {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored) return resolveLocale(stored);
  return resolveLocale(window.navigator.language);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleId>(initialLocale);

  const setLocale = useCallback((nextLocale: LocaleId) => {
    setLocaleState(nextLocale);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const numberFormat = new Intl.NumberFormat(locale);
    return {
      locale,
      setLocale,
      t: createTranslator(locale),
      formatNumber: (number) => numberFormat.format(number),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
