import { FormEvent, useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { getCurrentUser } from "../../shared/api/profile";
import { logout } from "../../shared/api/auth";
import { getAvatarColor } from "../../shared/utils/avatar";
import type { UserProfile } from "../../shared/types/user";
import { useWorkspace } from "../../shared/workspace/WorkspaceContext";
import type { WorkspaceType } from "../../shared/types/workspace";
import "./Navigation.css";

function NavigationIcon({ type }: { type: WorkspaceType | "chevron" | "plus" }) {
  const commonProps = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (type === "team") {
    return (
      <svg {...commonProps}>
        <path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16" />
        <path d="M9 21v-5h3v5" />
        <path d="M8 7h1" />
        <path d="M12 7h1" />
        <path d="M8 11h1" />
        <path d="M12 11h1" />
        <path d="M3 21h18" />
      </svg>
    );
  }

  if (type === "chevron") {
    return (
      <svg {...commonProps}>
        <path d="m6 9 6 6 6-6" />
      </svg>
    );
  }

  if (type === "plus") {
    return (
      <svg {...commonProps}>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10.5V20h14v-9.5" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

export function Navigation() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserProfile | null>(null);
  const {
    workspaces,
    currentWorkspace,
    currentWorkspaceId,
    setCurrentWorkspaceId,
    createOrganization,
    isLoading,
  } = useWorkspace();
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceDescription, setWorkspaceDescription] = useState("");
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let isMounted = true;

    getCurrentUser()
      .then((currentUser) => {
        if (isMounted) {
          setUser(currentUser);
        }
      })
      .catch(() => {
        if (isMounted) {
          setUser(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (!workspaceRef.current?.contains(event.target as Node)) {
        setIsWorkspaceOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, []);

  function handleLogout() {
    logout();
    navigate("/auth", { replace: true });
  }

  async function handleCreateWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorkspaceError(null);
    if (!workspaceName.trim()) {
      setWorkspaceError("Введите название организации");
      return;
    }

    try {
      const createdWorkspace = await createOrganization({
        name: workspaceName,
        description: workspaceDescription || null,
        type: "team",
      });
      setWorkspaceName("");
      setWorkspaceDescription("");
      setIsCreateWorkspaceOpen(false);
      setIsWorkspaceOpen(false);
      navigate("/team");
      setCurrentWorkspaceId(createdWorkspace.id);
    } catch (caughtError) {
      setWorkspaceError(caughtError instanceof Error ? caughtError.message : "Не удалось создать организацию");
    }
  }

  const avatarLabel = user?.avatar_letter || user?.username.slice(0, 1).toUpperCase() || "T";
  const avatarColor = getAvatarColor(user?.username || "time-tracking");
  const personalWorkspaces = workspaces.filter((workspace) => workspace.type === "personal");
  const teamWorkspaces = workspaces.filter((workspace) => workspace.type === "team");

  return (
    <header className="navigation">
      <div className="navigation__inner app-container">
        <div className="navigation__brand">Time Tracking</div>

        <div className="navigation__workspace" ref={workspaceRef}>
          <span className="navigation__workspace-label">Workspace</span>
          <button
            className="navigation__workspace-trigger"
            type="button"
            onClick={() => setIsWorkspaceOpen((isOpen) => !isOpen)}
            disabled={isLoading || workspaces.length === 0}
            aria-haspopup="menu"
            aria-expanded={isWorkspaceOpen}
          >
            <span className={`navigation__workspace-icon navigation__workspace-icon--${currentWorkspace?.type ?? "personal"}`}>
              <NavigationIcon type={currentWorkspace?.type ?? "personal"} />
            </span>
            <strong>{currentWorkspace?.name ?? "Workspace"}</strong>
            <em>
              <NavigationIcon type="chevron" />
            </em>
          </button>
          {isWorkspaceOpen && (
            <div className="navigation__workspace-menu" role="menu">
              {personalWorkspaces.length > 0 && <p>Личное пространство</p>}
              {personalWorkspaces.map((workspace) => (
                  <button
                    type="button"
                    role="menuitem"
                    className={workspace.id === currentWorkspaceId ? "is-active" : ""}
                    key={workspace.id}
                    onClick={() => {
                      setCurrentWorkspaceId(workspace.id);
                      setIsWorkspaceOpen(false);
                    }}
                  >
                    <span className="navigation__workspace-icon navigation__workspace-icon--personal">
                      <NavigationIcon type="personal" />
                    </span>
                    <span className="navigation__workspace-name">{workspace.name}</span>
                  </button>
                ))}
              <p>Организации</p>
              {teamWorkspaces.length > 0 ? (
                teamWorkspaces.map((workspace) => (
                  <button
                    type="button"
                    role="menuitem"
                    className={workspace.id === currentWorkspaceId ? "is-active" : ""}
                    key={workspace.id}
                    onClick={() => {
                      setCurrentWorkspaceId(workspace.id);
                      setIsWorkspaceOpen(false);
                    }}
                  >
                    <span className="navigation__workspace-icon navigation__workspace-icon--team">
                      <NavigationIcon type="team" />
                    </span>
                    <span className="navigation__workspace-name">{workspace.name}</span>
                  </button>
                ))
              ) : (
                <span className="navigation__workspace-empty">Организаций пока нет</span>
              )}
              <button
                className="navigation__workspace-create"
                type="button"
                onClick={() => {
                  setWorkspaceError(null);
                  setIsCreateWorkspaceOpen(true);
                  setIsWorkspaceOpen(false);
                }}
              >
                <NavigationIcon type="plus" />
                Создать организацию
              </button>
            </div>
          )}
        </div>

        <nav className="navigation__links" aria-label="Основная навигация">
          <NavLink to="/dashboard">Таймер</NavLink>
          <NavLink to="/projects">Проекты</NavLink>
          <NavLink to="/reports">Отчёты</NavLink>
          <NavLink to="/team">Команда</NavLink>
          <NavLink to="/profile">Профиль</NavLink>
        </nav>

        <div className="navigation__user">
          <button
            className="navigation__avatar"
            type="button"
            style={{ backgroundColor: avatarColor }}
            aria-label="Профиль пользователя"
            onClick={() => navigate("/profile")}
          >
            {avatarLabel}
          </button>
          <button className="navigation__logout" type="button" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </div>
      {isCreateWorkspaceOpen && (
        <div className="navigation-modal-backdrop" role="presentation" onClick={() => setIsCreateWorkspaceOpen(false)}>
          <form className="navigation-modal" onSubmit={handleCreateWorkspace} onClick={(event) => event.stopPropagation()}>
            <h2>Создать организацию</h2>
            <p>Организация появится в workspace switcher и будет доступна участникам после добавления.</p>
            <label>
              <span>Название</span>
              <input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} />
            </label>
            <label>
              <span>Описание</span>
              <textarea value={workspaceDescription} onChange={(event) => setWorkspaceDescription(event.target.value)} />
            </label>
            {workspaceError && <strong>{workspaceError}</strong>}
            <div className="navigation-modal__actions">
              <button className="button button--green" type="submit">
                Создать
              </button>
              <button className="button" type="button" onClick={() => setIsCreateWorkspaceOpen(false)}>
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}
    </header>
  );
}
