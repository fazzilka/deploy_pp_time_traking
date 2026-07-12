import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useLocale } from "./i18n";

export function App() {
  const location = useLocation();
  const { t, text } = useLocale();

  useEffect(() => {
    const section = location.pathname.startsWith("/projects")
      ? t("projects.title")
      : location.pathname.startsWith("/reports")
        ? t("reports.title")
        : location.pathname.startsWith("/team")
          ? t("team.title")
          : location.pathname.startsWith("/profile")
            ? t("profile.title")
            : location.pathname.startsWith("/auth")
              ? text("Вход", "Sign in")
              : t("tasks.queue.title");
    document.title = `${section} - Time Tracking`;
  }, [location.pathname, t, text]);

  return <Outlet />;
}
