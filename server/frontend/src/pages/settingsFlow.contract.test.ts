import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settingsSource = readFileSync(new URL("./SettingsPage/SettingsPage.tsx", import.meta.url), "utf8");
const settingsStyles = readFileSync(new URL("./SettingsPage/SettingsPage.css", import.meta.url), "utf8");
const profileSource = readFileSync(new URL("./ProfilePage/ProfilePage.tsx", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("../app/router.tsx", import.meta.url), "utf8");
const navigationSource = readFileSync(
  new URL("../components/Navigation/Navigation.tsx", import.meta.url),
  "utf8",
);
const languageSwitcherSource = readFileSync(
  new URL("../components/LanguageSwitcher/LanguageSwitcher.tsx", import.meta.url),
  "utf8",
);
const localeContextSource = readFileSync(new URL("../i18n/LocaleContext.tsx", import.meta.url), "utf8");
const profileApiSource = readFileSync(new URL("../shared/api/profile.ts", import.meta.url), "utf8");
const userTypesSource = readFileSync(new URL("../shared/types/user.ts", import.meta.url), "utf8");
const ru = readFileSync(new URL("../i18n/locales/ru.ts", import.meta.url), "utf8");
const en = readFileSync(new URL("../i18n/locales/en.ts", import.meta.url), "utf8");

describe("dedicated settings workspace contracts", () => {
  it("removes the full notification form from profile and exposes settings navigation", () => {
    expect(profileSource).not.toContain("getNotificationPreferences");
    expect(profileSource).not.toContain("profile-notification-settings__form");
    expect(profileSource).toContain('to="/settings/general"');
    expect(navigationSource).toContain('to="/settings/general"');
    expect(routerSource).toContain('path: "/settings/notifications"');
    expect(routerSource).toContain('<SettingsPage section="security" />');
  });

  it("keeps interface locale in General and removes a separate email language control", () => {
    const notificationSection = settingsSource.slice(
      settingsSource.indexOf('section === "notifications"'),
      settingsSource.indexOf('section === "security"'),
    );
    expect(settingsSource).toContain('id="interface-language"');
    expect(notificationSection).not.toContain("interface-language");
    expect(notificationSection).not.toContain("locale:");
    expect(languageSwitcherSource).toContain("updateNotificationPreferences({ locale: nextLocale })");
    expect(localeContextSource).toContain("getNotificationPreferences()");
  });

  it("preserves category choices while the master channel is disabled", () => {
    expect(settingsSource).toContain('updateEmailPreference("email_enabled", event.target.checked)');
    expect(settingsSource).toContain("disabled={!preferences.email_enabled}");
    expect(settingsSource).not.toContain('updateEmailPreference("deadline_24h", false)');
    expect(settingsSource).not.toContain('updateEmailPreference("deadline_1h", false)');
    expect(settingsSource).not.toContain('updateEmailPreference("deadline_overdue", false)');
  });

  it("uses partial PATCH without resetting unrelated preferences", () => {
    expect(userTypesSource).toContain("Partial<");
    expect(profileApiSource).toContain("...notificationPreferencesStore");
    expect(settingsSource).toContain("email_enabled: preferences.email_enabled");
    expect(settingsSource).toContain("deadline_overdue: preferences.deadline_overdue");
  });

  it("provides loading, success, error, accessible grouping, and mobile layout", () => {
    expect(settingsSource).toContain('role={state === "error" ? "alert" : "status"}');
    expect(settingsSource).toContain("settings-toggle-group");
    expect(settingsSource).toContain("<fieldset");
    expect(settingsSource).toContain("<legend");
    expect(settingsStyles).toContain("@media (max-width: 760px)");
    expect(settingsStyles).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(settingsStyles).not.toContain("overflow-x: auto");
  });

  it("ships the settings hierarchy in both locales", () => {
    for (const source of [ru, en]) {
      expect(source).toContain('"settings.navigation.general"');
      expect(source).toContain('"settings.notifications.email.master"');
      expect(source).toContain('"settings.security.changePassword"');
    }
    expect(ru).not.toContain("Язык писем");
    expect(en).not.toContain("Email language");
  });
});
