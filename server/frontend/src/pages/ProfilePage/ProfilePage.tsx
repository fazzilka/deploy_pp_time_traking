import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ActivityGrid } from "../../components/ActivityGrid/ActivityGrid";
import { GeneratedAvatar } from "../../components/GeneratedAvatar";
import { LoadingSkeleton } from "../../components/LoadingSkeleton/LoadingSkeleton";
import { PriorityIcon } from "../../components/PriorityIcon/PriorityIcon";
import { ProtectedSpaceStatus } from "../../components/ProtectedSpaceStatus";
import { StatCard } from "../../components/StatCard/StatCard";
import {
  getCurrentUser,
  getProfileStats,
  getUserActivity,
  regenerateMyAvatar,
  updateCurrentUser,
} from "../../shared/api/profile";
import { getSummary } from "../../shared/api/reports";
import type { ActivityResponse, SummaryResponse } from "../../shared/types/reports";
import {
  EMPTY_USER_STATS,
  type UserProfile,
  type UserStats,
} from "../../shared/types/user";
import { formatDate, formatHumanDuration } from "../../shared/utils/time";
import { useLocale } from "../../i18n";
import "./ProfilePage.css";

const currentYear = new Date().getFullYear();
const EMPTY_ACTIVITY: ActivityResponse = {
  days: [],
  summary: {
    active_days_count: 0,
    current_streak_days: 0,
    max_streak_days: 0,
    total_intervals_count: 0,
    total_time_seconds: 0,
  },
};
const EMPTY_SUMMARY: SummaryResponse = {
  total_time_seconds_all_tasks: 0,
  tasks_with_time_count: 0,
  top_tasks: [],
};

export function ProfilePage() {
  const { locale, t } = useLocale();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [topTasks, setTopTasks] = useState<SummaryResponse["top_tasks"]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [isRegeneratingAvatar, setIsRegeneratingAvatar] = useState(false);

  async function loadProfile() {
    setIsLoading(true);
    setError(null);

    try {
      const [nextUser, nextStats, nextActivity, summary] = await Promise.all([
        getCurrentUser(),
        getProfileStats().catch(() => EMPTY_USER_STATS),
        getUserActivity(currentYear).catch(() => EMPTY_ACTIVITY),
        getSummary(3).catch(() => EMPTY_SUMMARY),
      ]);
      setUser(nextUser);
      setStats(nextStats);
      setActivity(nextActivity);
      setTopTasks(summary.top_tasks);
      setUsername(nextUser.username);
      setFullName(nextUser.full_name ?? "");
    } catch {
      setError(t("profile.errors.load"));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadProfile();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const updatedUser = await updateCurrentUser({
        username,
        full_name: fullName || null,
      });
      setUser(updatedUser);
      setIsEditing(false);
    } catch {
      setError(t("profile.errors.update"));
    }
  }


  async function handleRegenerateAvatar() {
    setError(null);
    setIsRegeneratingAvatar(true);

    try {
      const updatedUser = await regenerateMyAvatar();
      setUser(updatedUser);
    } catch {
      setError(t("profile.errors.avatar"));
    } finally {
      setIsRegeneratingAvatar(false);
    }
  }

  if (isLoading && !user) {
    return (
      <main className="profile-page app-container">
        <LoadingSkeleton label={t("profile.loading")} variant="profile" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="profile-page app-container">
        <div className="status-message status-message--error">{error || t("profile.errors.noData")}</div>
      </main>
    );
  }

  const displayName = user.full_name || user.username;
  const avatarSeed = user.avatar_seed ?? user.email ?? user.username ?? user.id ?? user.avatar_letter;
  const safeStats = stats ?? user.stats ?? EMPTY_USER_STATS;
  const safeActivity = activity ?? EMPTY_ACTIVITY;
  const topThreeTasks = topTasks.slice(0, 3);
  const maxTopTaskTime = Math.max(...topThreeTasks.map((task) => task.total_time_seconds), 1);

  return (
    <main className="profile-page app-container">
      <div className="profile-layout content-reveal">
        <aside className="profile-sidebar">
          <div className="profile-avatar-wrapper">
            <GeneratedAvatar
              className="profile-avatar"
              seed={avatarSeed}
              letter={user.avatar_letter}
              size={180}
              title={displayName}
            />
          </div>
          <h1 className="profile-name">{displayName}</h1>
          <p className="profile-username">@{user.username}</p>
          <ProtectedSpaceStatus />

          <div className="profile-actions">
            <button className="profile-edit" type="button" onClick={() => setIsEditing((value) => !value)}>
              {t("profile.actions.edit")}
            </button>
            <Link className="profile-edit profile-edit--link" to="/settings/general">
              {t("profile.openSettings")}
            </Link>
            <button
              className="profile-edit"
              type="button"
              onClick={handleRegenerateAvatar}
              disabled={isRegeneratingAvatar}
            >
              {t(isRegeneratingAvatar ? "profile.avatar.generating" : "profile.avatar.regenerate")}
            </button>
          </div>

          {isEditing && (
            <form className="profile-form" onSubmit={handleSubmit}>
              <label>
                {t("profile.fields.username")}
                <input className="text-field" value={username} onChange={(event) => setUsername(event.target.value)} required />
              </label>
              <label>
                {t("profile.fields.fullName")}
                <input className="text-field" value={fullName} onChange={(event) => setFullName(event.target.value)} />
              </label>
              <div className="profile-form__actions">
                <button className="button button--green" type="submit">
                  {t("common.actions.save")}
                </button>
                <button className="button" type="button" onClick={() => setIsEditing(false)}>
                  {t("common.actions.cancel")}
                </button>
              </div>
            </form>
          )}

          <dl className="profile-meta">
            <div>
              <dt>{t("profile.fields.email")}</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>{t("profile.fields.role")}</dt>
              <dd>{t(`roles.${user.role}`)}</dd>
            </div>
            <div>
              <dt>{t("profile.fields.joined")}</dt>
              <dd>{formatDate(user.created_at, locale)}</dd>
            </div>
          </dl>
        </aside>

        <section className="profile-main">
          <p className="eyebrow">{t("profile.title")}</p>
          <h2 className="profile-main__title">{displayName}</h2>

          {error && <div className="status-message status-message--error profile-error">{error}</div>}

          <ActivityGrid days={safeActivity.days} year={currentYear} />

          <div className="profile-stats">
            <StatCard
              title={t("profile.stats.currentStreak")}
              value={t("profile.stats.days", { count: safeStats.current_streak_days })}
              subtitle={t("profile.stats.noBreak")}
              accent="green"
            />
            <StatCard title={t("profile.stats.maximumStreak")} value={t("profile.stats.days", { count: safeStats.max_streak_days })} subtitle={t("profile.stats.best")} accent="blue" />
            <StatCard title={t("profile.stats.totalTime")} value={formatHumanDuration(safeStats.total_time_seconds, locale)} subtitle={t("profile.stats.allTasks")} accent="yellow" />
          </div>

          <section className="profile-top-tasks" aria-label={t("profile.tasks.title")}>
            <h2 className="profile-top-tasks__title">{t("profile.tasks.title")}</h2>
            <div className="profile-top-tasks__list">
              {topThreeTasks.length > 0 ? (
                topThreeTasks.map((task, index) => {
                  const progress = Math.max(8, (task.total_time_seconds / maxTopTaskTime) * 100);

                  return (
                    <article className="profile-top-task" key={task.id}>
                      <div className="profile-top-task__main">
                        <span className="profile-top-task__rank">{index + 1}</span>
                        <div className="profile-top-task__content">
                          <strong className="profile-top-task__name">
                            <PriorityIcon priority={task.priority} />
                            <span>{task.title}</span>
                          </strong>
                          <span className="profile-top-task__description">{task.description || t("profile.tasks.noDescription")}</span>
                        </div>
                        <span className="profile-top-task__time">{formatHumanDuration(task.total_time_seconds, locale)}</span>
                      </div>
                      <div className="profile-top-task__progress">
                        <div className="profile-top-task__progress-fill" style={{ width: `${progress}%` }} />
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="profile-top-tasks__empty">{t("profile.tasks.empty")}</div>
              )}
            </div>
          </section>
        </section>
      </div>

    </main>
  );
}
