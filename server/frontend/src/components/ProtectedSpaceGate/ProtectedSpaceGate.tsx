import type { ReactNode, FormEvent } from "react";
import { useState } from "react";
import { PasswordInput } from "../PasswordInput/PasswordInput";
import { useWorkspace } from "../../shared/workspace/WorkspaceContext";
import "./ProtectedSpaceGate.css";

export function ProtectedSpaceGate({ children }: { children: ReactNode }) {
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
      setError(unlockError instanceof Error ? unlockError.message : "Не удалось разблокировать");
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
          <p className="eyebrow">Protected Space</p>
          <h1>Защищённое пространство</h1>
          <p className="protected-space-gate__copy">
            Введите защитный пароль, чтобы продолжить. Используйте отдельный пароль,
            не совпадающий с паролем аккаунта.
          </p>
        </div>

        <PasswordInput
          name="vault-password"
          label="Защитный пароль"
          value={password}
          required
          autoComplete="current-password"
          onChange={setPassword}
          error={error ?? undefined}
        />

        <button className="protected-space-gate__button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Проверяем..." : "Разблокировать"}
        </button>
      </form>
    </main>
  );
}
