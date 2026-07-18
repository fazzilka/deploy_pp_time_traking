import type { ReactNode } from "react";
import type { UserRole } from "../../shared/types/user";
import { useLocale } from "../../i18n";
import "./AdminUI.css";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="admin-page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="admin-page-header__actions">{actions}</div>}
    </header>
  );
}

export function AdminRoleBadge({ role }: { role: UserRole }) {
  const { t } = useLocale();
  return (
    <span className={`admin-badge admin-badge--role-${role}`}>
      {t(role === "admin" ? "roles.admin" : "roles.user")}
    </span>
  );
}

export function AdminStatusBadge({ active }: { active: boolean }) {
  const { t } = useLocale();
  return (
    <span className={`admin-badge admin-badge--${active ? "active" : "inactive"}`}>
      <span aria-hidden="true" />
      {t(active ? "admin.users.status.active" : "admin.users.status.inactive")}
    </span>
  );
}

export function AdminEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="admin-empty-state">
      <span aria-hidden="true">◎</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

export function AdminErrorState({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div className="admin-error-state" role="alert">
      <p>{message}</p>
      <button className="button" type="button" onClick={onRetry}>
        {retryLabel}
      </button>
    </div>
  );
}
