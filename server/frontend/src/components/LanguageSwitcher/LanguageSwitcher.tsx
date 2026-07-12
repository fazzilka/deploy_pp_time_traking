import { useLocale } from "../../i18n";
import type { SupportedLocale } from "../../i18n";
import "./LanguageSwitcher.css";

const locales: SupportedLocale[] = ["ru", "en"];

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useLocale();

  return (
    <div className={`language-switcher ${className}`.trim()} role="group" aria-label={t("common.language.label")}>
      {locales.map((item) => (
        <button
          key={item}
          type="button"
          className="language-switcher__option"
          aria-pressed={locale === item}
          title={t(`common.language.${item}`)}
          onClick={() => setLocale(item)}
        >
          {item.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
