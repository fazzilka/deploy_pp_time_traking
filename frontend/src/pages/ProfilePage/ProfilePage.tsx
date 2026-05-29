import { FormEvent, useEffect, useState } from "react";
import { ActivityGrid } from "../../components/ActivityGrid/ActivityGrid";
import { StatCard } from "../../components/StatCard/StatCard";
import { getTasks } from "../../shared/api/tasks";
import { getCurrentUser, getUserActivity, updateCurrentUser } from "../../shared/api/profile";
import type { ActivityResponse } from "../../shared/types/reports";
import type { Task } from "../../shared/types/task";
import type { User } from "../../shared/types/user";
import { getAvatarColor } from "../../shared/utils/avatar";
import { formatDate, formatHumanDuration } from "../../shared/utils/time";
import "./ProfilePage.css";

export function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");

  async function loadProfile(year = selectedYear) {
    setIsLoading(true);
    setError(null);

    try {
      const [nextUser, nextActivity, nextTasks] = await Promise.all([getCurrentUser(), getUserActivity(year), getTasks()]);
      setUser(nextUser);
      setActivity(nextActivity);
      setRecentTasks(nextTasks.filter((task) => task.total_time_seconds > 0).slice(0, 2));
      setUsername(nextUser.username);
      setFullName(nextUser.full_name ?? "");
    } catch {
      setError("Не удалось загрузить профиль");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadProfile(selectedYear);
  }, [selectedYear]);

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
      setError("Не удалось обновить профиль");
    }
  }

  if (isLoading && !user) {
    return (
      <main className="profile-page app-container">
        <div className="status-message">Загружаем профиль...</div>
      </main>
    );
  }

  if (!user || !activity) {
    return (
      <main className="profile-page app-container">
        <div className="status-message status-message--error">{error || "Нет данных профиля"}</div>
      </main>
    );
  }

  const displayName = user.full_name || user.username;
  const avatarColor = getAvatarColor(user.username || user.email);

  return (
    <main className="profile-page app-container">
      <div className="profile-layout">
        <aside className="profile-sidebar">
          <div className="profile-avatar" style={{ backgroundColor: avatarColor }}>
            {user.avatar_letter}
          </div>
          <h1 className="profile-name">{displayName}</h1>
          <p className="profile-username">@{user.username}</p>

          <button className="profile-edit" type="button" onClick={() => setIsEditing((value) => !value)}>
            Редактировать профиль
          </button>

          {isEditing && (
            <form className="profile-form" onSubmit={handleSubmit}>
              <label>
                Username
                <input className="text-field" value={username} onChange={(event) => setUsername(event.target.value)} required />
              </label>
              <label>
                Full name
                <input className="text-field" value={fullName} onChange={(event) => setFullName(event.target.value)} />
              </label>
              <div className="profile-form__actions">
                <button className="button button--green" type="submit">
                  Сохранить
                </button>
                <button className="button" type="button" onClick={() => setIsEditing(false)}>
                  Отмена
                </button>
              </div>
            </form>
          )}

          <dl className="profile-meta">
            <div>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{user.role}</dd>
            </div>
            <div>
              <dt>Joined</dt>
              <dd>{formatDate(user.created_at)}</dd>
            </div>
          </dl>
        </aside>

        <section className="profile-main">
          <p className="eyebrow">Профиль</p>
          <h2 className="profile-main__title">{displayName}</h2>

          {error && <div className="status-message status-message--error profile-error">{error}</div>}

          <ActivityGrid days={activity.days} selectedYear={selectedYear} onYearChange={setSelectedYear} />

          <div className="profile-stats">
            <StatCard
              title="Текущая серия"
              value={`${activity.summary.current_streak_days} дней`}
              subtitle="без перерыва"
              accent="green"
            />
            <StatCard title="Максимальная серия" value={`${activity.summary.max_streak_days} дней`} subtitle="лучший результат" accent="blue" />
            <StatCard title="Всего времени" value={formatHumanDuration(user.stats.total_time_seconds)} subtitle="по всем задачам" accent="yellow" />
          </div>

          <div className="profile-recent">
            <span>Последние задачи</span>
            {recentTasks.length > 0 ? (
              recentTasks.map((task) => (
                <strong key={task.id}>
                  {task.title} · {formatHumanDuration(task.total_time_seconds)}
                </strong>
              ))
            ) : (
              <strong>Нет задач с временем</strong>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
