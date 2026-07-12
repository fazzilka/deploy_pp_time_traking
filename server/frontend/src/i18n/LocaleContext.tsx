import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { en } from "./locales/en";
import { ru, type TranslationKey } from "./locales/ru";
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  LOCALE_STORAGE_KEY,
  type SupportedLocale,
  type TranslationParams,
} from "./types";

const resources = { ru, en } as const;

function detectInitialLocale(): SupportedLocale {
  const storedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (isSupportedLocale(storedLocale)) {
    return storedLocale;
  }
  if (storedLocale !== null) {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
    return DEFAULT_LOCALE;
  }
  return navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/{{(\w+)}}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match,
  );
}

type LocaleContextValue = {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  plural: (baseKey: string, count: number) => string;
  text: (ruText: string, enText: string) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(detectInitialLocale);

  const setLocale = useCallback((nextLocale: SupportedLocale) => {
    setLocaleState(nextLocale);
    localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === LOCALE_STORAGE_KEY && isSupportedLocale(event.newValue)) {
        setLocaleState(event.newValue);
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => interpolate(resources[locale][key] ?? resources.ru[key], params),
    [locale],
  );

  const plural = useCallback(
    (baseKey: string, count: number) => {
      const category = new Intl.PluralRules(locale).select(count);
      const candidate = `${baseKey}_${category}` as TranslationKey;
      const fallback = `${baseKey}_other` as TranslationKey;
      const key = candidate in resources[locale] ? candidate : fallback;
      return t(key, { count });
    },
    [locale, t],
  );

  const text = useCallback((ruText: string, enText: string) => (locale === "ru" ? ruText : enText), [locale]);

  const value = useMemo(() => ({ locale, setLocale, t, plural, text }), [locale, plural, setLocale, t, text]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used inside LocaleProvider");
  return context;
}
