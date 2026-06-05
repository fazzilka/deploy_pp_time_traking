import { FormEvent, useEffect, useState } from "react";
import { ActivityGrid } from "../../components/ActivityGrid/ActivityGrid";
import { PasswordInput } from "../../components/PasswordInput/PasswordInput";
import { PriorityIcon } from "../../components/PriorityIcon/PriorityIcon";
import { StatCard } from "../../components/StatCard/StatCard";
import { changePassword, getCurrentUser, getUserActivity, updateCurrentUser } from "../../shared/api/profile";
import { getSummary } from "../../shared/api/reports";
import type { ActivityResponse, SummaryResponse } from "../../shared/types/reports";
import type { User } from "../../shared/types/user";
import { getAvatarColor } from "../../shared/utils/avatar";
import { formatDate, formatHumanDuration } from "../../shared/utils/time";
import "./ProfilePage.css";

const currentYear = new Date().getFullYear();

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

export function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [topTasks, setTopTasks] = useState<SummaryResponse["top_tasks"]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>(initialPasswordForm);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false);

  async function loadProfile() {
    setIsLoading(true);
    setError(null);

    try {
      const [nextUser, nextActivity, summary] = await Promise.all([
        getCurrentUser(),
        getUserActivity(currentYear),
        getSummary(3),
      ]);
      setUser(nextUser);
      setActivity(nextActivity);
      setTopTasks(summary.top_tasks);
      setUsername(nextUser.username);
      setFullName(nextUser.full_name ?? "");
    } catch {
      setError("Не удалось загрузить профиль");
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
      setError("Не удалось обновить профиль");
    }
  }

  function updatePasswordField(field: keyof PasswordFormState, value: string) {
    setPasswordForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }

  function openPasswordModal() {
    setPasswordForm(initialPasswordForm);
    setPasswordError(null);
    setPasswordSuccess(null);
    setIsPasswordModalOpen(true);
  }

  function closePasswordModal() {
    setPasswordForm(initialPasswordForm);
    setPasswordError(null);
    setIsPasswordModalOpen(false);
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!passwordForm.oldPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordError("Заполните все поля");
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setPasswordError("Новый пароль должен содержать не менее 6 символов");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("Новый пароль и подтверждение пароля не совпадают");
      return;
    }

    if (passwordForm.oldPassword === passwordForm.newPassword) {
      setPasswordError("Новый пароль должен отличаться от старого");
      return;
    }

    setIsPasswordSubmitting(true);

    try {
      const response = await changePassword({
        old_password: passwordForm.oldPassword,
        new_password: passwordForm.newPassword,
        confirm_password: passwordForm.confirmPassword,
      });
      setPasswordForm(initialPasswordForm);
      setIsPasswordModalOpen(false);
      setPasswordSuccess(response.message || "Пароль успешно изменён");
    } catch (caughtError) {
      const nextError = caughtError instanceof Error ? caughtError.message : "Не удалось изменить пароль";
      setPasswordError(nextError);
    } finally {
      setIsPasswordSubmitting(false);
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
  const topThreeTasks = topTasks.slice(0, 3);
  const maxTopTaskTime = Math.max(...topThreeTasks.map((task) => task.total_time_seconds), 1);

  return (
    <main className="profile-page app-container">
      <div className="profile-layout">
        <aside className="profile-sidebar">
          <div className="profile-avatar" style={{ backgroundColor: avatarColor }}>
            {user.avatar_letter}
          </div>
          <h1 className="profile-name">{displayName}</h1>
          <p className="profile-username">@{user.username}</p>

          <div className="profile-actions">
            <button className="profile-edit" type="button" onClick={() => setIsEditing((value) => !value)}>
              Редактировать профиль
            </button>
            <button className="profile-edit" type="button" onClick={openPasswordModal}>
              Изменить пароль
            </button>
          </div>

          {passwordSuccess && <p className="profile-password-success">{passwordSuccess}</p>}

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

          <ActivityGrid days={activity.days} year={currentYear} />

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

          <section className="profile-top-tasks" aria-label="Топ задач">
            <h2 className="profile-top-tasks__title">Топ задач</h2>
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
                          <span className="profile-top-task__description">{task.description || "Описание не указано"}</span>
                        </div>
                        <span className="profile-top-task__time">{formatHumanDuration(task.total_time_seconds)}</span>
                      </div>
                      <div className="profile-top-task__progress">
                        <div className="profile-top-task__progress-fill" style={{ width: `${progress}%` }} />
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="profile-top-tasks__empty">Пока нет задач с накопленным временем.</div>
              )}
            </div>
          </section>
        </section>
      </div>

      {isPasswordModalOpen && (
        <div className="change-password-backdrop" role="presentation" onClick={closePasswordModal}>
          <section
            className="change-password-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-password-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="change-password-modal__title" id="change-password-title">
              Изменение пароля
            </h2>
            <form className="change-password-modal__form" onSubmit={handlePasswordSubmit}>
              <PasswordInput
                id="oldPassword"
                name="oldPassword"
                label="Старый пароль"
                value={passwordForm.oldPassword}
                autoComplete="current-password"
                required
                minLength={6}
                onChange={(value) => updatePasswordField("oldPassword", value)}
              />
              <PasswordInput
                id="newPassword"
                name="newPassword"
                label="Новый пароль"
                value={passwordForm.newPassword}
                autoComplete="new-password"
                required
                minLength={6}
                onChange={(value) => updatePasswordField("newPassword", value)}
              />
              <PasswordInput
                id="confirmNewPassword"
                name="confirmNewPassword"
                label="Подтвердите новый пароль"
                value={passwordForm.confirmPassword}
                autoComplete="new-password"
                required
                minLength={6}
                onChange={(value) => updatePasswordField("confirmPassword", value)}
              />

              {passwordError && <p className="change-password-modal__error">{passwordError}</p>}

              <div className="change-password-modal__actions">
                <button className="button" type="button" onClick={closePasswordModal}>
                  Отмена
                </button>
                <button className="button button--green" type="submit" disabled={isPasswordSubmitting}>
                  {isPasswordSubmitting ? "Сохраняем..." : "Сохранить"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
