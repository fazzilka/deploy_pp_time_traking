import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { LanguageSwitcher } from "../LanguageSwitcher/LanguageSwitcher";
import { GeneratedAvatar } from "../GeneratedAvatar";
import { useAdminActor } from "../AdminRoute/AdminRoute";
import { useLocale } from "../../i18n";
import "./AdminLayout.css";

const navigationItems = [
  { to: "/admin/overview", key: "admin.navigation.overview", icon: "▦" },
  { to: "/admin/users", key: "admin.navigation.users", icon: "◎" },
] as const;

export function AdminLayout() {
  const { t } = useLocale();
  const actor = useAdminActor();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 820px)").matches);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const sectionTitle = location.pathname.startsWith("/admin/users")
    ? t("admin.navigation.users")
    : t("admin.navigation.overview");

  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 820px)");
    function handleChange(event: MediaQueryListEvent) {
      setIsMobile(event.matches);
      if (!event.matches) setIsMenuOpen(false);
    }
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen || !isMobile) return;
    const focusId = window.setTimeout(
      () => sidebarRef.current?.querySelector<HTMLElement>("a")?.focus(),
      0,
    );
    return () => window.clearTimeout(focusId);
  }, [isMenuOpen, isMobile]);

  return (
    <div className="admin-shell">
      <button
        className={`admin-sidebar-backdrop${isMenuOpen ? " admin-sidebar-backdrop--open" : ""}`}
        type="button"
        aria-label={t("admin.navigation.closeMenu")}
        tabIndex={isMenuOpen ? 0 : -1}
        onClick={() => setIsMenuOpen(false)}
      />
      <aside
        ref={sidebarRef}
        id="admin-sidebar"
        className={`admin-sidebar${isMenuOpen ? " admin-sidebar--open" : ""}`}
        aria-hidden={isMobile && !isMenuOpen}
        inert={isMobile && !isMenuOpen}
      >
        <div className="admin-sidebar__brand">
          <span>Time Tracking</span>
          <strong>{t("admin.badge")}</strong>
        </div>
        <nav className="admin-sidebar__navigation" aria-label={t("admin.navigation.label")}>
          {navigationItems.map((item) => (
            <NavLink key={item.to} to={item.to}>
              <span aria-hidden="true">{item.icon}</span>
              {t(item.key)}
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar__footer">
          <div className="admin-sidebar__actor">
            <GeneratedAvatar
              seed={actor.avatar_seed ?? actor.email}
              letter={actor.avatar_letter}
              size={34}
              title={actor.full_name || actor.username}
            />
            <span>
              <strong>{actor.full_name || actor.username}</strong>
              <small>@{actor.username}</small>
            </span>
          </div>
          <Link className="admin-sidebar__back" to="/dashboard">
            <span aria-hidden="true">←</span>
            {t("admin.navigation.backToApp")}
          </Link>
        </div>
      </aside>

      <div className="admin-workspace">
        <header className="admin-topbar">
          <div className="admin-topbar__section">
            <button
              ref={menuButtonRef}
              className="admin-menu-button"
              type="button"
              aria-label={t("admin.navigation.openMenu")}
              aria-expanded={isMenuOpen}
              aria-controls="admin-sidebar"
              onClick={() => setIsMenuOpen(true)}
            >
              <span aria-hidden="true">☰</span>
            </button>
            <span>{sectionTitle}</span>
          </div>
          <LanguageSwitcher />
        </header>
        <div className="route-transition" key={location.pathname}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
