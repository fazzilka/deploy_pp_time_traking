import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LanguageSwitcher } from "../../components/LanguageSwitcher/LanguageSwitcher";
import { PasswordInput } from "../../components/PasswordInput/PasswordInput";
import { VerificationCodeInput } from "../../components/VerificationCodeInput/VerificationCodeInput";
import { useLocale } from "../../i18n";
import {
  isAuthenticated,
  login,
  resendRegistrationCode,
  saveAccessToken,
  startRegistration,
  verifyRegistration,
} from "../../shared/api/auth";
import { getInvitationContinuation } from "../../shared/api/invitations";
import { verificationErrorKey } from "../../shared/utils/securityErrors";
import "./AuthPage.css";

type AuthMode = "login" | "register" | "verify";

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
  const { t } = useLocale();
  const initialMode = new URLSearchParams(window.location.search).get("mode") === "register" ? "register" : "login";
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [form, setForm] = useState<AuthFormState>(initialFormState);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    if (isAuthenticated()) {
      navigate(getInvitationContinuation() ? "/invitations/accept" : "/dashboard", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (mode === "verify") {
      codeInputRef.current?.focus();
    }
  }, [mode]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const isLogin = mode === "login";

  function updateField(field: keyof AuthFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
    setMessage(null);
    setCode("");
  }

  async function handleCredentialsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    setError(null);
    setMessage(null);

    if (!isLogin) {
      if (form.password.length < 12) {
        setError(t("auth.validation.passwordLength"));
        return;
      }
      if (form.password !== form.confirmPassword) {
        setError(t("auth.validation.passwordMismatch"));
        return;
      }
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      if (isLogin) {
        const response = await login({ email: form.email, password: form.password });
        saveAccessToken(response.access_token);
        navigate(getInvitationContinuation() ? "/invitations/accept" : "/dashboard", { replace: true });
        return;
      }
      const response = await startRegistration({
        email: form.email,
        username: form.username,
        full_name: form.fullName,
        password: form.password,
      });
      setVerificationId(response.verification_id);
      setMaskedEmail(response.email_masked);
      setCooldown(response.resend_available_in_seconds);
      setMode("verify");
    } catch {
      if (isLogin) {
        setForm((current) => ({ ...current, password: "" }));
        setError(t("auth.errors.credentials"));
        passwordInputRef.current?.focus();
      } else {
        setError(t("common.errors.generic"));
      }
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleVerificationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verificationId || code.length !== 6 || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await verifyRegistration(verificationId, code);
      saveAccessToken(response.access_token);
      navigate(getInvitationContinuation() ? "/invitations/accept" : "/dashboard", { replace: true });
    } catch (caughtError) {
      setError(t(verificationErrorKey(caughtError)));
      setCode("");
      codeInputRef.current?.focus();
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    if (!verificationId || cooldown > 0 || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await resendRegistrationCode(verificationId);
      setCooldown(response.resend_available_in_seconds);
      setCode("");
      setMessage(t("auth.verifyEmail.resent"));
      codeInputRef.current?.focus();
    } catch (caughtError) {
      setError(t(verificationErrorKey(caughtError)));
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  const title = mode === "verify" ? t("auth.verifyEmail.title") : t(isLogin ? "auth.login.title" : "auth.register.title");

  return (
    <main className="auth-page">
      <LanguageSwitcher className="auth-page__language" />
      <section className="auth-intro" aria-labelledby="auth-brand-title">
        <div className="auth-intro__brand"><span aria-hidden="true">TT</span> Time Tracking</div>
        <div className="auth-intro__content">
          <p className="eyebrow">{t("auth.eyebrow")}</p>
          <h1 id="auth-brand-title">{t("auth.hero.title")}</h1>
          <p>{t("auth.hero.description")}</p>
          <ul><li>{t("auth.hero.priority")}</li><li>{t("auth.hero.projects")}</li><li>{t("auth.hero.time")}</li></ul>
        </div>
      </section>

      <section className="auth-panel" aria-labelledby="auth-form-title">
        <div className="auth-page__logo" aria-hidden="true">TT</div>
        <p className="auth-panel__brand">Time Tracking</p>
        <h2 id="auth-form-title">{title}</h2>
        <p className="auth-panel__copy">
          {mode === "verify"
            ? t("auth.verifyEmail.description", { email: maskedEmail })
            : t(isLogin ? "auth.login.description" : "auth.register.description")}
        </p>

        {mode === "verify" ? (
          <form className="auth-card" onSubmit={handleVerificationSubmit}>
            <div className="auth-field">
              <label htmlFor="verification-code">{t("auth.verifyEmail.codeLabel")}</label>
              <VerificationCodeInput
                ref={codeInputRef}
                id="verification-code"
                value={code}
                onChange={setCode}
                invalid={Boolean(error)}
                describedBy={error ? "verification-error" : undefined}
              />
            </div>
            {error && <p id="verification-error" className="auth-card__error" role="alert">{error}</p>}
            {message && <p className="auth-card__message" role="status">{message}</p>}
            <button className="auth-submit" type="submit" disabled={isSubmitting || code.length !== 6}>
              {t(isSubmitting ? "auth.verifyEmail.confirming" : "auth.verifyEmail.confirm")}
            </button>
            <button className="auth-link-button" type="button" disabled={isSubmitting || cooldown > 0} onClick={() => void handleResend()}>
              {cooldown > 0 ? t("auth.verifyEmail.resendIn", { seconds: cooldown }) : t("auth.verifyEmail.resend")}
            </button>
            <button className="auth-link-button" type="button" disabled={isSubmitting} onClick={() => switchMode("register")}>
              {t("auth.verifyEmail.changeEmail")}
            </button>
          </form>
        ) : (
          <form className="auth-card" onSubmit={handleCredentialsSubmit}>
            <div className="auth-field"><label htmlFor="email">{t("auth.fields.email")}</label><input id="email" type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} autoComplete="email" required /></div>
            {!isLogin && <><div className="auth-field"><label htmlFor="username">{t("auth.fields.username")}</label><input id="username" value={form.username} onChange={(event) => updateField("username", event.target.value)} autoComplete="username" required /></div><div className="auth-field"><label htmlFor="fullName">{t("auth.fields.fullName")}</label><input id="fullName" value={form.fullName} onChange={(event) => updateField("fullName", event.target.value)} autoComplete="name" /></div></>}
            <PasswordInput ref={passwordInputRef} id="password" name="password" label={t("auth.fields.password")} value={form.password} autoComplete={isLogin ? "current-password" : "new-password"} required minLength={isLogin ? 6 : 12} onChange={(value) => updateField("password", value)} />
            {!isLogin && <PasswordInput id="confirmPassword" name="confirmPassword" label={t("auth.fields.confirmPassword")} value={form.confirmPassword} autoComplete="new-password" required minLength={12} onChange={(value) => updateField("confirmPassword", value)} />}
            {error && <p className="auth-card__error" role="alert">{error}</p>}
            {message && <p className="auth-card__message">{message}</p>}
            <button className="auth-submit" type="submit" disabled={isSubmitting}>{t(isSubmitting ? "auth.actions.submitting" : isLogin ? "auth.actions.signIn" : "auth.actions.register")}</button>
          </form>
        )}

        {mode !== "verify" && <div className="auth-switch-card">{t(isLogin ? "auth.switch.noAccount" : "auth.switch.hasAccount")} {" "}<button type="button" onClick={() => switchMode(isLogin ? "register" : "login")}>{t(isLogin ? "auth.switch.create" : "auth.actions.signIn")}</button></div>}
      </section>
    </main>
  );
}
