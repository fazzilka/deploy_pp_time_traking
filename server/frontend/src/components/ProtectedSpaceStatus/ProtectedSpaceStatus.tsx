import { useWorkspace } from "../../shared/workspace/WorkspaceContext";
import { useLocale } from "../../i18n";
import "./ProtectedSpaceStatus.css";

export function ProtectedSpaceStatus() {
  const { text } = useLocale();
  const { currentWorkspace, isCurrentWorkspaceProtectedLocked, lockProtectedPersonalSpace } = useWorkspace();

  if (!currentWorkspace?.is_protected || isCurrentWorkspaceProtectedLocked) {
    return null;
  }

  return (
    <section className="protected-space-status" aria-label={text("Статус защищённого пространства", "Protected space status")}>
      <span className="protected-space-status__icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
        </svg>
      </span>
      <span className="protected-space-status__text">{text("Защищённое пространство разблокировано", "Protected space unlocked")}</span>
      <button
        className="protected-space-status__lock"
        type="button"
        onClick={() => {
          void lockProtectedPersonalSpace().catch(() => undefined);
        }}
      >
        {text("Заблокировать", "Lock")}
      </button>
    </section>
  );
}
