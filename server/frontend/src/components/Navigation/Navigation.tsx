import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { getCurrentUser } from "../../shared/api/profile";
import { logout } from "../../shared/api/auth";
import { createWorkspace } from "../../shared/api/workspaces";
import { getAvatarColor } from "../../shared/utils/avatar";
import type { UserProfile } from "../../shared/types/user";
import type { Workspace } from "../../shared/types/workspace";
import { useWorkspace } from "../../shared/workspace/WorkspaceContext";
import "./Navigation.css";

type NavigationIconName = "home" | "building" | "plus" | "chevron" | "check" | "users";

function NavigationIcon({ name }: { name: NavigationIconName }) {
  const props = {
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

  switch (name) {
    case "home":
      return (
        <svg {...props}>
          <path d="m3 11 9-8 9 8" />
          <path d="M5 10v10h14V10" />
          <path d="M9 20v-6h6v6" />
        </svg>
      );
    case "building":
      return (
        <svg {...props}>
          <path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16" />
          <path d="M9 21v-5h3v5" />
          <path d="M8 7h1" />
          <path d="M12 7h1" />
          <path d="M8 11h1" />
          <path d="M12 11h1" />
          <path d="M3 21h18" />
        </svg>
      );
    case "plus":
      return (
        <svg {...props}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...props}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      );
    case "check":
      return (
        <svg {...props}>
          <path d="m5 12 4 4 10-10" />
        </svg>
      );
    case "users":
      return (
        <svg {...props}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    default:
      return null;
  }
}

function getWorkspaceIcon(workspace: Workspace | null) {
  if (!workspace || workspace.type === "personal") {
    return "home";
  }

  return "building";
}

function getWorkspaceSubtitle(workspace: Workspace) {
  if (workspace.type === "personal") {
    return "Личное пространство";
  }

  return `${workspace.members_count} участник${workspace.members_count === 1 ? "" : "ов"}`;
}

export function Navigation() {
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [user, setUser] = useState<UserProfile | null>(null);
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newWorkspaceDescription, setNewWorkspaceDescription] = useState("");
  const [createWorkspaceError, setCreateWorkspaceError] = useState<string | null>(null);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);

  const {
    workspaces,
    currentWorkspace,
    currentWorkspaceId,
    setCurrentWorkspaceId,
    refreshWorkspaces,
    isLoading,
  } = useWorkspace();

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
    function handleClickOutside(event: MouseEvent) {
      if (!dropdownRef.current) {
        return;
      }

      if (!dropdownRef.current.contains(event.target as Node)) {
        setIsWorkspaceMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsWorkspaceMenuOpen(false);
        setIsCreateWorkspaceOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const personalWorkspaces = useMemo(
    () => workspaces.filter((workspace) => workspace.type === "personal"),
    [workspaces],
  );

  const teamWorkspaces = useMemo(
    () => workspaces.filter((workspace) => workspace.type !== "personal"),
    [workspaces],
  );

  function handleLogout() {
    logout();
    navigate("/auth", { replace: true });
  }

  function handleWorkspaceSelect(workspaceId: number) {
    setCurrentWorkspaceId(workspaceId);
    setIsWorkspaceMenuOpen(false);
  }

  function openCreateWorkspaceModal() {
    setIsWorkspaceMenuOpen(false);
    setCreateWorkspaceError(null);
    setIsCreateWorkspaceOpen(true);
  }

  async function handleCreateWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = newWorkspaceName.trim();
    const trimmedDescription = newWorkspaceDescription.trim();

    if (!trimmedName) {
      setCreateWorkspaceError("Введите название организации");
      return;
    }

    setIsCreatingWorkspace(true);
    setCreateWorkspaceError(null);

    try {
      const workspace = await createWorkspace({
        name: trimmedName,
        description: trimmedDescription || null,
        type: "team",
      });

      await refreshWorkspaces();
      setCurrentWorkspaceId(workspace.id);

      setNewWorkspaceName("");
      setNewWorkspaceDescription("");
      setIsCreateWorkspaceOpen(false);
      navigate("/team");
    } catch (error) {
      setCreateWorkspaceError(error instanceof Error ? error.message : "Не удалось создать организацию");
    } finally {
      setIsCreatingWorkspace(false);
    }
  }

  const avatarLabel = user?.avatar_letter || user?.username.slice(0, 1).toUpperCase() || "T";
  const avatarColor = getAvatarColor(user?.username || "time-tracking");
  const currentWorkspaceIcon = getWorkspaceIcon(currentWorkspace);

  return (
    <header className="navigation">
      <div className="navigation__inner app-container">
        <div className="navigation__left">
          <button className="navigation__brand" type="button" onClick={() => navigate("/dashboard")}>
            Time Tracking
          </button>

          <div className="navigation__workspace" ref={dropdownRef}>
            <span className="navigation__workspace-label">Workspace</span>

            <button
              className={`navigation__workspace-button${isWorkspaceMenuOpen ? " navigation__workspace-button--open" : ""}`}
              type="button"
              onClick={() => setIsWorkspaceMenuOpen((isOpen) => !isOpen)}
              disabled={isLoading || workspaces.length === 0}
              aria-expanded={isWorkspaceMenuOpen}
              aria-haspopup="menu"
            >
              <span className="navigation__workspace-icon">
                <NavigationIcon name={currentWorkspaceIcon} />
              </span>

              <span className="navigation__workspace-name">
                {currentWorkspace?.name ?? "Workspace"}
              </span>

              <span className="navigation__workspace-chevron">
                <NavigationIcon name="chevron" />
              </span>
            </button>

            {isWorkspaceMenuOpen && (
              <div className="navigation__workspace-menu" role="menu">
                {personalWorkspaces.length > 0 && (
                  <div className="navigation__workspace-group">
                    <p>Личное пространство</p>

                    {personalWorkspaces.map((workspace) => (
                      <button
                        className={`navigation__workspace-item${
                          workspace.id === currentWorkspaceId ? " navigation__workspace-item--active" : ""
                        }`}
                        type="button"
                        key={workspace.id}
                        onClick={() => handleWorkspaceSelect(workspace.id)}
                        role="menuitem"
                      >
                        <span className="navigation__workspace-item-icon navigation__workspace-item-icon--personal">
                          <NavigationIcon name="home" />
                        </span>

                        <span className="navigation__workspace-item-copy">
                          <strong>{workspace.name}</strong>
                          <em>{getWorkspaceSubtitle(workspace)}</em>
                        </span>

                        {workspace.id === currentWorkspaceId && (
                          <span className="navigation__workspace-item-check">
                            <NavigationIcon name="check" />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                <div className="navigation__workspace-group">
                  <p>Организации</p>

                  {teamWorkspaces.length > 0 ? (
                    teamWorkspaces.map((workspace) => (
                      <button
                        className={`navigation__workspace-item${
                          workspace.id === currentWorkspaceId ? " navigation__workspace-item--active" : ""
                        }`}
                        type="button"
                        key={workspace.id}
                        onClick={() => handleWorkspaceSelect(workspace.id)}
                        role="menuitem"
                      >
                        <span className="navigation__workspace-item-icon navigation__workspace-item-icon--team">
                          <NavigationIcon name="building" />
                        </span>

                        <span className="navigation__workspace-item-copy">
                          <strong>{workspace.name}</strong>
                          <em>{getWorkspaceSubtitle(workspace)}</em>
                        </span>

                        {workspace.id === currentWorkspaceId && (
                          <span className="navigation__workspace-item-check">
                            <NavigationIcon name="check" />
                          </span>
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="navigation__workspace-empty">
                      Организаций пока нет
                    </div>
                  )}
                </div>

                <button
                  className="navigation__workspace-create"
                  type="button"
                  onClick={openCreateWorkspaceModal}
                  role="menuitem"
                >
                  <span>
                    <NavigationIcon name="plus" />
                  </span>
                  Создать организацию
                </button>
              </div>
            )}
          </div>
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

          <span className="navigation__username">{user?.username ?? "Профиль"}</span>

          <button className="navigation__logout" type="button" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </div>

      {isCreateWorkspaceOpen && (
        <div
          className="navigation-modal-backdrop"
          role="presentation"
          onClick={() => setIsCreateWorkspaceOpen(false)}
        >
          <form
            className="navigation-modal"
            onSubmit={handleCreateWorkspace}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="navigation-modal__header">
              <span>
                <NavigationIcon name="building" />
              </span>
              <div>
                <h2>Создать организацию</h2>
                <p>Организация объединяет участников, проекты и задачи.</p>
              </div>
            </div>

            <label>
              <span>Название организации</span>
              <input
                type="text"
                value={newWorkspaceName}
                onChange={(event) => setNewWorkspaceName(event.target.value)}
                placeholder="Например, МТУСИ"
                autoFocus
              />
            </label>

            <label>
              <span>Описание</span>
              <textarea
                value={newWorkspaceDescription}
                onChange={(event) => setNewWorkspaceDescription(event.target.value)}
                placeholder="Кратко опишите, для чего нужна организация"
                rows={4}
              />
            </label>

            {createWorkspaceError && (
              <p className="navigation-modal__error">{createWorkspaceError}</p>
            )}

            <div className="navigation-modal__actions">
              <button
                className="navigation-modal__button navigation-modal__button--primary"
                type="submit"
                disabled={isCreatingWorkspace}
              >
                {isCreatingWorkspace ? "Создаём..." : "Создать"}
              </button>

              <button
                className="navigation-modal__button navigation-modal__button--secondary"
                type="button"
                onClick={() => setIsCreateWorkspaceOpen(false)}
              >
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}
    </header>
  );
}