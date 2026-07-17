import { useState } from "react";
import { useLocale } from "../../i18n";
import type { SupportedLocale } from "../../i18n";
import { isAuthenticated } from "../../shared/api/auth";
import { updateNotificationPreferences } from "../../shared/api/profile";
import "./LanguageSwitcher.css";

const locales: SupportedLocale[] = ["ru", "en"];

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useLocale();
  const [isSaving, setIsSaving] = useState(false);

  async function handleLocaleChange(nextLocale: SupportedLocale) {
    if (nextLocale === locale || isSaving) return;
    const previousLocale = locale;
    setLocale(nextLocale);
    if (!isAuthenticated()) return;
    setIsSaving(true);
    try {
      const saved = await updateNotificationPreferences({ locale: nextLocale });
      setLocale(saved.locale);
    } catch {
      setLocale(previousLocale);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={`language-switcher ${className}`.trim()} role="group" aria-label={t("common.language.label")}>
      {locales.map((item) => (
        <button
          key={item}
          type="button"
          className="language-switcher__option"
          aria-pressed={locale === item}
          disabled={isSaving}
          title={t(`common.language.${item}`)}
          onClick={() => void handleLocaleChange(item)}
        >
          {item.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
