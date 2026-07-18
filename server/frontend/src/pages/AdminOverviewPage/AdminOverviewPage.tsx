import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminErrorState, AdminPageHeader } from "../../components/AdminUI/AdminUI";
import { GeneratedAvatar } from "../../components/GeneratedAvatar";
import { StatCard } from "../../components/StatCard/StatCard";
import { getAdminStats } from "../../shared/api/admin";
import type { AdminSystemStats } from "../../shared/types/admin";
import { formatHumanDuration } from "../../shared/utils/time";
import { useLocale } from "../../i18n";
import "./AdminOverviewPage.css";

export function AdminOverviewPage() {
  const { locale, t } = useLocale();
  const [stats, setStats] = useState<AdminSystemStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadStats = useCallback(async () => {
    setIsLoading(true);
    setError(false);
    try {
      setStats(await getAdminStats());
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  return (
    <main className="admin-page admin-overview-page">
      <AdminPageHeader
        eyebrow={t("admin.badge")}
        title={t("admin.overview.title")}
        description={t("admin.overview.description")}
      />

      {isLoading ? (
        <OverviewSkeleton label={t("admin.loading")} />
      ) : error || !stats ? (
        <AdminErrorState
          message={t("admin.errors.loadFailed")}
          retryLabel={t("admin.actions.retry")}
          onRetry={() => void loadStats()}
        />
      ) : (
        <>
          <section className="admin-overview-stats" aria-label={t("admin.overview.metrics")}>
            <StatCard title={t("admin.overview.totalUsers")} value={String(stats.users_count)} accent="blue" />
            <StatCard title={t("admin.overview.activeUsers")} value={String(stats.active_users_count)} />
            <StatCard title={t("admin.overview.admins")} value={String(stats.admins_count)} accent="yellow" />
            <StatCard title={t("admin.overview.tasks")} value={String(stats.tasks_count)} accent="blue" />
            <StatCard title={t("admin.overview.totalTime")} value={formatHumanDuration(stats.total_time_seconds, locale)} />
          </section>

          <section className="admin-top-users" aria-labelledby="admin-top-users-title">
            <div className="admin-section-heading">
              <div>
                <h2 id="admin-top-users-title">{t("admin.overview.topUsers")}</h2>
                <p>{t("admin.overview.topUsersDescription")}</p>
              </div>
              <Link to="/admin/users">{t("admin.overview.viewAllUsers")}</Link>
            </div>
            {stats.top_users.length === 0 ? (
              <p className="admin-top-users__empty">{t("admin.overview.noActivity")}</p>
            ) : (
              <div className="admin-top-users__list">
                {stats.top_users.map((user, index) => (
                  <Link className="admin-top-user" key={user.id} to={`/admin/users/${user.id}`}>
                    <span className="admin-top-user__rank" aria-label={`${index + 1}`}>
                      {index + 1}
                    </span>
                    <GeneratedAvatar
                      seed={user.avatar_seed ?? user.username}
                      letter={user.avatar_letter}
                      size={42}
                      title={user.full_name || user.username}
                    />
                    <span className="admin-top-user__identity">
                      <strong>{user.full_name || user.username}</strong>
                      <small>@{user.username}</small>
                    </span>
                    <strong className="admin-top-user__time">
                      {formatHumanDuration(user.total_time_seconds, locale)}
                    </strong>
                    <span className="admin-top-user__arrow" aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function OverviewSkeleton({ label }: { label: string }) {
  return (
    <div className="admin-overview-skeleton" role="status" aria-label={label}>
      <div className="admin-overview-stats">
        {Array.from({ length: 5 }, (_, index) => (
          <span className="admin-skeleton admin-skeleton--stat" key={index} />
        ))}
      </div>
      <span className="admin-skeleton admin-skeleton--panel" />
    </div>
  );
}
