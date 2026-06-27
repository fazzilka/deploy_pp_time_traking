import { useWorkspace } from "../../shared/workspace/WorkspaceContext";
import "./ProtectedSpaceStatus.css";

export function ProtectedSpaceStatus() {
  const { currentWorkspace, isCurrentWorkspaceProtectedLocked, lockProtectedPersonalSpace } = useWorkspace();

  if (!currentWorkspace?.is_protected || isCurrentWorkspaceProtectedLocked) {
    return null;
  }

  return (
    <section className="protected-space-status" aria-label="Статус защищённого пространства">
      <span className="protected-space-status__icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
        </svg>
      </span>
      <span className="protected-space-status__text">Защищённое пространство разблокировано</span>
      <button
        className="protected-space-status__lock"
        type="button"
        onClick={() => {
          void lockProtectedPersonalSpace().catch(() => undefined);
        }}
      >
        Заблокировать
      </button>
    </section>
  );
}
