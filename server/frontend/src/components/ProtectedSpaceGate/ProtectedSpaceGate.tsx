import type { ReactNode, FormEvent } from "react";
import { useState } from "react";
import { PasswordInput } from "../PasswordInput/PasswordInput";
import { useWorkspace } from "../../shared/workspace/WorkspaceContext";
import { useLocale } from "../../i18n";
import "./ProtectedSpaceGate.css";

export function ProtectedSpaceGate({ children }: { children: ReactNode }) {
  const { text } = useLocale();
  const { isCurrentWorkspaceProtectedLocked, unlockProtectedPersonalSpace } = useWorkspace();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await unlockProtectedPersonalSpace(password);
      setPassword("");
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : text("Не удалось разблокировать", "Could not unlock the space"));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isCurrentWorkspaceProtectedLocked) {
    return <>{children}</>;
  }

  return (
    <main className="protected-space-gate app-container">
      <form className="protected-space-gate__panel" onSubmit={handleUnlock}>
        <div className="protected-space-gate__icon" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
          </svg>
        </div>
        <div>
          <p className="eyebrow">{text("Защищённое пространство", "Protected space")}</p>
          <h1>{text("Защищённое пространство", "Protected space")}</h1>
          <p className="protected-space-gate__copy">
            {text("Введите защитный пароль, чтобы продолжить. Используйте отдельный пароль, не совпадающий с паролем аккаунта.", "Enter the security password to continue. Use a separate password that differs from your account password.")}
          </p>
        </div>

        <PasswordInput
          name="vault-password"
          label={text("Защитный пароль", "Security password")}
          value={password}
          required
          autoComplete="current-password"
          onChange={setPassword}
          error={error ?? undefined}
        />

        <button className="protected-space-gate__button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? text("Проверяем...", "Checking...") : text("Разблокировать", "Unlock")}
        </button>
      </form>
    </main>
  );
}
