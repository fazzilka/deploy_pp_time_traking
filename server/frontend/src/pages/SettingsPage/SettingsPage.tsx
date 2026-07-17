import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { PasswordInput } from "../../components/PasswordInput/PasswordInput";
import { useLocale, type SupportedLocale } from "../../i18n";
import {
  changePassword,
  getNotificationPreferences,
  updateNotificationPreferences,
} from "../../shared/api/profile";
import type { NotificationPreferences } from "../../shared/types/user";
import "./SettingsPage.css";

export type SettingsSection = "general" | "notifications" | "security";

type SaveState = "idle" | "saving" | "saved" | "error";

type PasswordFormState = {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const initialPasswordForm: PasswordFormState = {
  oldPassword: "",
  newPassword: "",
  confirmPassword: "",
};

const navigationItems = ["general", "notifications", "security"] as const;

export function SettingsPage({ section }: { section: SettingsSection }) {
  const { locale, setLocale, t } = useLocale();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [generalState, setGeneralState] = useState<SaveState>("idle");
  const [notificationState, setNotificationState] = useState<SaveState>("idle");
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>(initialPasswordForm);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isPasswordSaving, setIsPasswordSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    void getNotificationPreferences()
      .then((loaded) => {
        if (!active) return;
        setPreferences(loaded);
        setLocale(loaded.locale);
        setLoadError(false);
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [setLocale]);

  async function handleLocaleChange(nextLocale: SupportedLocale) {
    if (!preferences || nextLocale === locale || generalState === "saving") return;
    const previousLocale = locale;
    setLocale(nextLocale);
    setPreferences((current) => (current ? { ...current, locale: nextLocale } : current));
    setGeneralState("saving");
    try {
      const saved = await updateNotificationPreferences({ locale: nextLocale });
      setPreferences(saved);
      setLocale(saved.locale);
      setGeneralState("saved");
    } catch {
      setPreferences((current) => (current ? { ...current, locale: previousLocale } : current));
      setLocale(previousLocale);
      setGeneralState("error");
    }
  }

  function updateEmailPreference(
    key: "email_enabled" | "deadline_24h" | "deadline_1h" | "deadline_overdue",
    value: boolean,
  ) {
    setPreferences((current) => (current ? { ...current, [key]: value } : current));
    setNotificationState("idle");
  }

  async function handleNotificationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preferences || notificationState === "saving") return;
    setNotificationState("saving");
    try {
      const saved = await updateNotificationPreferences({
        email_enabled: preferences.email_enabled,
        deadline_24h: preferences.deadline_24h,
        deadline_1h: preferences.deadline_1h,
        deadline_overdue: preferences.deadline_overdue,
      });
      setPreferences(saved);
      setNotificationState("saved");
    } catch {
      setNotificationState("error");
    }
  }

  function updatePasswordField(field: keyof PasswordFormState, value: string) {
    setPasswordForm((current) => ({ ...current, [field]: value }));
    setPasswordError(null);
    setPasswordSuccess(null);
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);
    if (!passwordForm.oldPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordError(t("profile.password.fillAll"));
      return;
    }
    if (passwordForm.newPassword.length < 12) {
      setPasswordError(t("profile.password.minLength"));
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError(t("profile.password.mismatch"));
      return;
    }
    if (passwordForm.oldPassword === passwordForm.newPassword) {
      setPasswordError(t("profile.password.same"));
      return;
    }
    setIsPasswordSaving(true);
    try {
      await changePassword({
        old_password: passwordForm.oldPassword,
        new_password: passwordForm.newPassword,
        confirm_password: passwordForm.confirmPassword,
      });
      setPasswordForm(initialPasswordForm);
      setPasswordSuccess(t("profile.password.success"));
    } catch (caughtError) {
      setPasswordError(
        caughtError instanceof Error ? caughtError.message : t("profile.password.error"),
      );
    } finally {
      setIsPasswordSaving(false);
    }
  }

  const pageTitle = t(`settings.${section}.title`);
  const pageDescription = t(`settings.${section}.description`);

  return (
    <main className="settings-page app-container">
      <header className="settings-page__header">
        <p className="eyebrow">{t("settings.title")}</p>
        <h1 id={`settings-${section}-title`}>{pageTitle}</h1>
        <p>{pageDescription}</p>
      </header>

      <div className="settings-layout">
        <nav className="settings-navigation" aria-label={t("settings.navigation.label")}>
          {navigationItems.map((item) => (
            <NavLink key={item} to={`/settings/${item}`}>
              {t(`settings.navigation.${item}`)}
            </NavLink>
          ))}
        </nav>

        <section className="settings-content" aria-labelledby={`settings-${section}-title`}>
          {section !== "security" && isLoading ? (
            <div className="settings-status">{t("common.loading")}</div>
          ) : section !== "security" && (loadError || !preferences) ? (
            <div className="settings-status settings-status--error" role="alert">
              {t("settings.loadError")}
            </div>
          ) : section === "general" && preferences ? (
            <section className="settings-card">
              <div className="settings-card__heading">
                <h2>{t("settings.general.interfaceLanguage")}</h2>
                <p>{t("settings.general.languageHint")}</p>
              </div>
              <label className="settings-field" htmlFor="interface-language">
                <span>{t("settings.general.interfaceLanguage")}</span>
                <select
                  id="interface-language"
                  value={locale}
                  disabled={generalState === "saving"}
                  onChange={(event) =>
                    void handleLocaleChange(event.target.value as SupportedLocale)
                  }
                >
                  <option value="ru">{t("settings.general.languageRussian")}</option>
                  <option value="en">{t("settings.general.languageEnglish")}</option>
                </select>
              </label>
              <SaveMessage state={generalState} scope="general" />
            </section>
          ) : section === "notifications" && preferences ? (
            <section className="settings-card">
              <div className="settings-card__heading">
                <h2>{t("settings.notifications.email.title")}</h2>
                <p id="email-notifications-description">
                  {t("settings.notifications.email.description")}
                </p>
              </div>
              <form onSubmit={handleNotificationSubmit}>
                <fieldset className="settings-toggle-group" aria-describedby="email-notifications-description">
                  <legend className="sr-only">{t("settings.notifications.email.title")}</legend>
                  <label className="settings-toggle settings-toggle--master">
                    <input
                      type="checkbox"
                      checked={preferences.email_enabled}
                      onChange={(event) =>
                        updateEmailPreference("email_enabled", event.target.checked)
                      }
                    />
                    <span>
                      <strong>{t("settings.notifications.email.master")}</strong>
                      <small>{t("settings.notifications.email.masterHint")}</small>
                    </span>
                  </label>
                  <div className="settings-toggle-group__categories">
                    {([
                      ["deadline_24h", "settings.notifications.email.deadline24h"],
                      ["deadline_1h", "settings.notifications.email.deadline1h"],
                      ["deadline_overdue", "settings.notifications.email.overdue"],
                    ] as const).map(([key, label]) => (
                      <label className="settings-toggle" key={key}>
                        <input
                          type="checkbox"
                          checked={preferences[key]}
                          disabled={!preferences.email_enabled}
                          onChange={(event) => updateEmailPreference(key, event.target.checked)}
                        />
                        <span>{t(label)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                {preferences.email_suppressed && (
                  <p className="settings-warning">{t("settings.notifications.email.suppressed")}</p>
                )}
                <div className="settings-form-footer">
                  <SaveMessage state={notificationState} scope="notifications.email" />
                  <button
                    className="button button--green"
                    type="submit"
                    disabled={notificationState === "saving"}
                  >
                    {t(
                      notificationState === "saving"
                        ? "settings.notifications.email.saving"
                        : "settings.notifications.email.save",
                    )}
                  </button>
                </div>
              </form>
            </section>
          ) : section === "security" ? (
            <section className="settings-card settings-card--narrow">
              <div className="settings-card__heading">
                <h2>{t("settings.security.changePassword")}</h2>
                <p>{t("settings.security.passwordHint")}</p>
              </div>
              <form className="settings-password-form" onSubmit={handlePasswordSubmit}>
                <PasswordInput
                  id="settings-old-password"
                  name="oldPassword"
                  label={t("profile.password.old")}
                  value={passwordForm.oldPassword}
                  autoComplete="current-password"
                  required
                  minLength={12}
                  onChange={(value) => updatePasswordField("oldPassword", value)}
                />
                <PasswordInput
                  id="settings-new-password"
                  name="newPassword"
                  label={t("profile.password.new")}
                  value={passwordForm.newPassword}
                  autoComplete="new-password"
                  required
                  minLength={12}
                  onChange={(value) => updatePasswordField("newPassword", value)}
                />
                <PasswordInput
                  id="settings-confirm-password"
                  name="confirmPassword"
                  label={t("profile.password.confirm")}
                  value={passwordForm.confirmPassword}
                  autoComplete="new-password"
                  required
                  minLength={12}
                  onChange={(value) => updatePasswordField("confirmPassword", value)}
                />
                {passwordError && <p className="settings-status settings-status--error" role="alert">{passwordError}</p>}
                {passwordSuccess && <p className="settings-status settings-status--success" role="status">{passwordSuccess}</p>}
                <div className="settings-form-footer">
                  <button className="button button--green" type="submit" disabled={isPasswordSaving}>
                    {t(isPasswordSaving ? "common.actions.saving" : "common.actions.save")}
                  </button>
                </div>
              </form>
            </section>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function SaveMessage({ state, scope }: { state: SaveState; scope: "general" | "notifications.email" }) {
  const { t } = useLocale();
  if (state === "idle" || state === "saving") return null;
  return (
    <p className={`settings-status settings-status--${state}`} role={state === "error" ? "alert" : "status"}>
      {t(`settings.${scope}.${state === "saved" ? "saved" : "saveError"}`)}
    </p>
  );
}
