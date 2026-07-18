import { createContext, useContext, useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isAuthenticated } from "../../shared/api/auth";
import { adminAccessRevokedEvent } from "../../shared/api/admin";
import { getCurrentUser } from "../../shared/api/profile";
import type { UserProfile } from "../../shared/types/user";
import { useLocale } from "../../i18n";
import "./AdminRoute.css";

const AdminActorContext = createContext<UserProfile | null>(null);

export function useAdminActor(): UserProfile {
  const actor = useContext(AdminActorContext);
  if (!actor) throw new Error("useAdminActor must be used inside AdminRoute");
  return actor;
}

export function AdminRoute() {
  const location = useLocation();
  const { t } = useLocale();
  const [actor, setActor] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(isAuthenticated());
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) return;
    let active = true;
    setIsLoading(true);
    void getCurrentUser({ force: true })
      .then((user) => {
        if (active) setActor(user);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function revokeAdminAccess() {
      setActor(null);
      setFailed(true);
      setIsLoading(false);
    }
    window.addEventListener(adminAccessRevokedEvent, revokeAdminAccess);
    return () => window.removeEventListener(adminAccessRevokedEvent, revokeAdminAccess);
  }, []);

  if (!isAuthenticated()) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  if (isLoading) {
    return (
      <main className="admin-route-status" aria-live="polite">
        <span className="admin-route-status__spinner" aria-hidden="true" />
        <p>{t("admin.loadingAccess")}</p>
      </main>
    );
  }

  if (failed || actor?.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <AdminActorContext.Provider value={actor}>
      <Outlet />
    </AdminActorContext.Provider>
  );
}
