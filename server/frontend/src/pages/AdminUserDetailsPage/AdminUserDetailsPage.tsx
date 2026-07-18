import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ActivityGrid } from "../../components/ActivityGrid/ActivityGrid";
import { AdminUserEditDialog } from "../../components/AdminUserEditDialog/AdminUserEditDialog";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { GeneratedAvatar } from "../../components/GeneratedAvatar";
import { StatCard } from "../../components/StatCard/StatCard";
import {
  AdminErrorState,
  AdminRoleBadge,
  AdminStatusBadge,
} from "../../components/AdminUI/AdminUI";
import { useAdminActor } from "../../components/AdminRoute/AdminRoute";
import { getAdminUser, getAdminUserActivity, updateAdminUser } from "../../shared/api/admin";
import { ApiError } from "../../shared/api/client";
import { synchronizeCurrentUserProfile } from "../../shared/api/profile";
import type { AdminUserActivity, AdminUserDetails } from "../../shared/types/admin";
import { formatDate, formatHumanDuration } from "../../shared/utils/time";
import { useLocale } from "../../i18n";
import "./AdminUserDetailsPage.css";

export function AdminUserDetailsPage() {
  const { locale, t } = useLocale();
  const actor = useAdminActor();
  const navigate = useNavigate();
  const params = useParams();
  const userId = Number(params.userId);
  const activityYear = new Date().getFullYear();
  const [user, setUser] = useState<AdminUserDetails | null>(null);
  const [activity, setActivity] = useState<AdminUserActivity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadUser = useCallback(async () => {
    if (!Number.isInteger(userId) || userId <= 0) {
      setLoadError(true);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(false);
    try {
      const [nextUser, nextActivity] = await Promise.all([
        getAdminUser(userId),
        getAdminUserActivity(userId, activityYear),
      ]);
      setUser(nextUser);
      setActivity(nextActivity);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [activityYear, userId]);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  async function confirmStatusChange() {
    if (!user || isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    setStatusError(null);
    try {
      const updated = await updateAdminUser(user.id, { is_active: !user.is_active });
      setUser(updated);
      setSuccessMessage(
        t(updated.is_active ? "admin.users.unblockSuccess" : "admin.users.blockSuccess"),
      );
      setIsStatusDialogOpen(false);
    } catch (error) {
      setStatusError(resolveStatusError(error, t));
    } finally {
      setIsUpdatingStatus(false);
    }
  }

  function handleEdited(updated: AdminUserDetails) {
    setUser(updated);
    setIsEditOpen(false);
    setSuccessMessage(t("admin.edit.success"));
    if (updated.id === actor.id) {
      synchronizeCurrentUserProfile(updated);
      if (updated.role !== "admin") navigate("/dashboard", { replace: true });
    }
  }

  if (isLoading) {
    return (
      <main className="admin-page admin-details-skeleton" role="status" aria-label={t("admin.loading")}>
        <span className="admin-skeleton admin-details-skeleton__hero" />
        <span className="admin-skeleton admin-details-skeleton__body" />
      </main>
    );
  }

  if (loadError || !user || !activity) {
    return (
      <main className="admin-page">
        <AdminErrorState
          message={t("admin.errors.userLoadFailed")}
          retryLabel={t("admin.actions.retry")}
          onRetry={() => void loadUser()}
        />
      </main>
    );
  }

  const isSelf = actor.id === user.id;
  const name = user.full_name || user.username || user.email;

  return (
    <main className="admin-page admin-user-details-page">
      <Link className="admin-details-back" to="/admin/users">← {t("admin.userDetails.back")}</Link>
      {successMessage && <p className="admin-toast admin-toast--success" role="status">{successMessage}</p>}

      <header className="admin-details-hero">
        <GeneratedAvatar seed={user.avatar_seed ?? user.email} letter={user.avatar_letter} size={74} title={name} />
        <div className="admin-details-hero__identity">
          <div className="admin-details-hero__badges">
            <AdminRoleBadge role={user.role} />
            <AdminStatusBadge active={user.is_active} />
          </div>
          <h1>{name}</h1>
          <p>@{user.username} · <span>{user.email}</span></p>
        </div>
        <div className="admin-details-hero__actions">
          <button className="button" type="button" onClick={() => setIsEditOpen(true)}>{t("admin.userDetails.edit")}</button>
          <button
            className={`button${user.is_active ? " button--red" : ""}`}
            type="button"
            disabled={isSelf && user.is_active}
            title={isSelf && user.is_active ? t("admin.errors.selfBlock") : undefined}
            onClick={() => {
              setStatusError(null);
              setIsStatusDialogOpen(true);
            }}
          >
            {t(user.is_active ? "admin.userDetails.block" : "admin.userDetails.unblock")}
          </button>
        </div>
      </header>

      <div className="admin-details-grid">
        <section className="admin-details-card" aria-labelledby="admin-user-information">
          <h2 id="admin-user-information">{t("admin.userDetails.information")}</h2>
          <dl className="admin-details-list">
            <InfoRow label={t("admin.userDetails.fields.id")} value={String(user.id)} />
            <InfoRow label={t("admin.userDetails.fields.email")} value={user.email} />
            <InfoRow label={t("admin.userDetails.fields.username")} value={`@${user.username}`} />
            <InfoRow label={t("admin.userDetails.fields.fullName")} value={user.full_name || t("admin.userDetails.notSpecified")} />
            <InfoRow label={t("admin.userDetails.fields.role")} value={<AdminRoleBadge role={user.role} />} />
            <InfoRow label={t("admin.userDetails.fields.status")} value={<AdminStatusBadge active={user.is_active} />} />
            <InfoRow label={t("admin.userDetails.fields.emailVerified")} value={t(user.email_verified ? "admin.userDetails.verified" : "admin.userDetails.notVerified")} />
            <InfoRow label={t("admin.userDetails.fields.createdAt")} value={formatDate(user.created_at, locale)} />
          </dl>
        </section>

        <section className="admin-details-card" aria-labelledby="admin-user-management">
          <h2 id="admin-user-management">{t("admin.userDetails.management")}</h2>
          <p>{t("admin.userDetails.managementDescription")}</p>
          <div className="admin-details-management-actions">
            <button className="button" type="button" onClick={() => setIsEditOpen(true)}>{t("admin.userDetails.edit")}</button>
            <button
              className={`button${user.is_active ? " button--red" : ""}`}
              type="button"
              disabled={isSelf && user.is_active}
              onClick={() => setIsStatusDialogOpen(true)}
            >
              {t(user.is_active ? "admin.userDetails.block" : "admin.userDetails.unblock")}
            </button>
          </div>
          {isSelf && <p className="admin-details-card__hint">{t("admin.userDetails.selfHint")}</p>}
        </section>
      </div>

      <section className="admin-details-activity" aria-labelledby="admin-user-activity">
        <div className="admin-section-heading">
          <div>
            <h2 id="admin-user-activity">{t("admin.userDetails.activity")}</h2>
            <p>{t("admin.userDetails.activityDescription")}</p>
          </div>
        </div>
        <div className="admin-details-stats">
          <StatCard title={t("admin.users.columns.tasks")} value={String(user.stats.tasks_count)} accent="blue" />
          <StatCard title={t("admin.overview.totalTime")} value={formatHumanDuration(user.stats.total_time_seconds, locale)} />
          <StatCard title={t("admin.userDetails.activeDays")} value={String(activity.summary.active_days_count)} accent="yellow" />
          <StatCard title={t("admin.userDetails.intervals")} value={String(activity.summary.total_intervals_count)} accent="blue" />
        </div>
        <ActivityGrid days={activity.days} year={activityYear} />
      </section>

      <AdminUserEditDialog
        open={isEditOpen}
        user={user}
        actor={actor}
        onClose={() => setIsEditOpen(false)}
        onSaved={handleEdited}
      />
      <ConfirmDialog
        open={isStatusDialogOpen}
        title={t(user.is_active ? "admin.blockDialog.title" : "admin.unblockDialog.title")}
        description={t(
          user.is_active ? "admin.blockDialog.description" : "admin.unblockDialog.description",
          { name },
        )}
        confirmLabel={t(
          isUpdatingStatus
            ? user.is_active
              ? "admin.blockDialog.blocking"
              : "admin.unblockDialog.unblocking"
            : user.is_active
              ? "admin.blockDialog.confirm"
              : "admin.unblockDialog.confirm",
        )}
        cancelLabel={t("admin.blockDialog.cancel")}
        destructive={user.is_active}
        isLoading={isUpdatingStatus}
        error={statusError}
        onCancel={() => {
          if (!isUpdatingStatus) setIsStatusDialogOpen(false);
        }}
        onConfirm={confirmStatusChange}
      />
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function resolveStatusError(
  error: unknown,
  t: ReturnType<typeof useLocale>["t"],
): string {
  if (error instanceof ApiError && error.code === "self_block") return t("admin.errors.selfBlock");
  if (error instanceof ApiError && error.code === "last_active_admin") return t("admin.errors.lastAdmin");
  return error instanceof Error ? error.message : t("admin.errors.updateFailed");
}
