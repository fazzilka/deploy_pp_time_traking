import type { FormEvent} from "react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PasswordInput } from "../../components/PasswordInput/PasswordInput";
import { isAuthenticated, login, register, saveAccessToken } from "../../shared/api/auth";
import "./AuthPage.css";

type AuthMode = "login" | "register";

type AuthFormState = {
  email: string;
  username: string;
  fullName: string;
  password: string;
  confirmPassword: string;
};

const initialFormState: AuthFormState = {
  email: "",
  username: "",
  fullName: "",
  password: "",
  confirmPassword: "",
};

export function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("login");
  const [form, setForm] = useState<AuthFormState>(initialFormState);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    if (isAuthenticated()) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate]);

  const isLogin = mode === "login";

  function updateField(field: keyof AuthFormState, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
    setMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmittingRef.current) {
      return;
    }

    setError(null);
    setMessage(null);

    if (!isLogin) {
      if (form.password.length < 6) {
        setError("Пароль должен содержать не менее 6 символов");
        return;
      }

      if (form.password !== form.confirmPassword) {
        setError("Пароли не совпадают");
        return;
      }
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const response = isLogin
        ? await login({
            email: form.email,
            password: form.password,
          })
        : await register({
            email: form.email,
            username: form.username,
            full_name: form.fullName,
            password: form.password,
          });

      if ("access_token" in response && response.access_token) {
        saveAccessToken(response.access_token);
        navigate("/dashboard", { replace: true });
        return;
      }

      setMode("login");
      setMessage("Аккаунт создан, теперь войдите");
    } catch (caughtError) {
      if (isLogin) {
        setForm((current) => ({
          ...current,
          password: "",
        }));
        setError("Неверный логин или пароль");
        passwordInputRef.current?.focus();
      } else {
        const nextError = caughtError instanceof Error ? caughtError.message : "Не удалось выполнить запрос";
        setError(nextError);
      }
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-intro" aria-labelledby="auth-brand-title">
        <div className="auth-intro__brand"><span aria-hidden="true">TT</span> Time Tracking</div>
        <div className="auth-intro__content">
          <p className="eyebrow">Рабочее пространство команды</p>
          <h1 id="auth-brand-title">Задачи, сроки и нагрузка в одном спокойном ритме.</h1>
          <p>Контролируйте состояние проектов и дедлайны, не теряя контекст ежедневной работы.</p>
          <ul>
            <li>Приоритеты и ближайшие сроки</li>
            <li>Состояние проектов и команды</li>
            <li>Учёт времени без лишнего внимания</li>
          </ul>
        </div>
      </section>

      <section className="auth-panel" aria-labelledby="auth-form-title">
        <div className="auth-page__logo" aria-hidden="true">TT</div>
        <p className="auth-panel__brand">Time Tracking</p>
        <h2 id="auth-form-title">{isLogin ? "Вход в аккаунт" : "Создание аккаунта"}</h2>
        <p className="auth-panel__copy">{isLogin ? "Продолжите работу со своими задачами." : "Создайте рабочее пространство за минуту."}</p>

        <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={form.email}
            onChange={(event) => updateField("email", event.target.value)}
            autoComplete="email"
            required
          />
        </div>

        {!isLogin && (
          <>
            <div className="auth-field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={form.username}
                onChange={(event) => updateField("username", event.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="auth-field">
              <label htmlFor="fullName">Full name</label>
              <input
                id="fullName"
                type="text"
                value={form.fullName}
                onChange={(event) => updateField("fullName", event.target.value)}
                autoComplete="name"
              />
            </div>
          </>
        )}

        <PasswordInput
          ref={passwordInputRef}
          id="password"
          name="password"
          label="Password"
          value={form.password}
          autoComplete={isLogin ? "current-password" : "new-password"}
          required
          minLength={6}
          onChange={(value) => updateField("password", value)}
        />

        {!isLogin && (
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            label="Confirm your password"
            value={form.confirmPassword}
            autoComplete="new-password"
            required
            minLength={6}
            onChange={(value) => updateField("confirmPassword", value)}
          />
        )}

        {error && <p className="auth-card__error">{error}</p>}
        {message && <p className="auth-card__message">{message}</p>}

        <button className="auth-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Подождите..." : isLogin ? "Войти" : "Зарегистрироваться"}
        </button>
        </form>

        <div className="auth-switch-card">
          {isLogin ? "Нет аккаунта?" : "Уже есть аккаунт?"}{" "}
          <button type="button" onClick={() => switchMode(isLogin ? "register" : "login")}>
            {isLogin ? "Создать" : "Войти"}
          </button>
        </div>
      </section>
    </main>
  );
}
