import { createContext, useContext } from "react";
import type { LocaleId, Translator } from "./lib/i18n";

export type I18nContextValue = {
  locale: LocaleId;
  setLocale: (locale: LocaleId) => void;
  t: Translator;
  formatNumber: (value: number) => string;
};

export const I18nContext = createContext<I18nContextValue | undefined>(
  undefined
);

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return value;
}
