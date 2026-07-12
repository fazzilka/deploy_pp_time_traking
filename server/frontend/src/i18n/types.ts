export const SUPPORTED_LOCALES = ["ru", "en"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "ru";
export const LOCALE_STORAGE_KEY = "time-tracking.locale";

export type TranslationParams = Record<string, string | number>;

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === "string" && SUPPORTED_LOCALES.includes(value as SupportedLocale);
}
