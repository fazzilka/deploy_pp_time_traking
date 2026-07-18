import type { FormEvent} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, useNavigate } from "react-router-dom";
import { GeneratedAvatar } from "../GeneratedAvatar";
import { NotificationsBell } from "../NotificationsBell/NotificationsBell";
import { PasswordInput } from "../PasswordInput/PasswordInput";
import { LanguageSwitcher } from "../LanguageSwitcher/LanguageSwitcher";
import { useLocale } from "../../i18n";
import { getCurrentUser, userProfileUpdatedEvent } from "../../shared/api/profile";
import { logout } from "../../shared/api/auth";
import { createWorkspace } from "../../shared/api/workspaces";
import type { UserProfile } from "../../shared/types/user";
import type { Workspace } from "../../shared/types/workspace";
import { useWorkspace } from "../../shared/workspace/WorkspaceContext";
import "./Navigation.css";

type NavigationIconName = "home" | "building" | "plus" | "chevron" | "check" | "users" | "lock" | "shield";

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
    case "lock":
      return (
        <svg {...props}>
          <rect x="4" y="10" width="16" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case "shield":
      return (
        <svg {...props}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    default:
      return null;
  }
}

function getWorkspaceIcon(workspace: Workspace | null) {
  if (workspace?.is_protected) {
    return "lock";
  }
  if (!workspace || workspace.type === "personal") {
    return "home";
  }

  return "building";
}

function getWorkspaceSubtitle(workspace: Workspace, locale: "ru" | "en", plural: (baseKey: string, count: number) => string) {
  if (workspace.is_protected) {
    return locale === "ru" ? "Требует защитный пароль" : "Requires a security password";
  }
  if (workspace.type === "personal") {
    return locale === "ru" ? "Личное пространство" : "Personal space";
  }

  return plural("navigation.workspace.members", workspace.members_count);
}

export function Navigation() {
  const { locale, plural, t } = useLocale();
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [user, setUser] = useState<UserProfile | null>(null);
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false);
  const [isCreateProtectedOpen, setIsCreateProtectedOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newWorkspaceDescription, setNewWorkspaceDescription] = useState("");
  const [createWorkspaceError, setCreateWorkspaceError] = useState<string | null>(null);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [protectedPassword, setProtectedPassword] = useState("");
  const [protectedError, setProtectedError] = useState<string | null>(null);
  const [isCreatingProtected, setIsCreatingProtected] = useState(false);

  const {
    workspaces,
    currentWorkspace,
    currentWorkspaceId,
    setCurrentWorkspaceId,
    refreshWorkspaces,
    isLoading,
    protectedSpaceStatus,
    createProtectedPersonalSpace,
  } = useWorkspace();

  useEffect(() => {
    let isMounted = true;

    function handleProfileUpdated(event: Event) {
      const nextUser = (event as CustomEvent<UserProfile>).detail;
      if (nextUser) {
        setUser(nextUser);
      }
    }

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

    window.addEventListener(userProfileUpdatedEvent, handleProfileUpdated);

    return () => {
      isMounted = false;
      window.removeEventListener(userProfileUpdatedEvent, handleProfileUpdated);
    };
  }, []);

  useEffect(() => {
    if (!isCreateWorkspaceOpen && !isCreateProtectedOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isCreateProtectedOpen, isCreateWorkspaceOpen]);

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
        setIsCreateProtectedOpen(false);
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
    () => workspaces.filter((workspace) => workspace.type === "personal" && !workspace.is_protected),
    [workspaces],
  );

  const protectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.is_protected) ?? null,
    [workspaces],
  );

  const teamWorkspaces = useMemo(
    () => workspaces.filter((workspace) => workspace.type !== "personal" && !workspace.is_protected),
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

  function openCreateProtectedModal() {
    setIsWorkspaceMenuOpen(false);
    setProtectedPassword("");
    setProtectedError(null);
    setIsCreateProtectedOpen(true);
  }

  async function handleCreateWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = newWorkspaceName.trim();
    const trimmedDescription = newWorkspaceDescription.trim();

    if (!trimmedName) {
      setCreateWorkspaceError(t("navigation.organization.nameRequired"));
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
      setCreateWorkspaceError(error instanceof Error ? error.message : t("navigation.organization.createError"));
    } finally {
      setIsCreatingWorkspace(false);
    }
  }

  async function handleCreateProtectedSpace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (protectedPassword.length < 12) {
      setProtectedError(t("navigation.protected.passwordLength"));
      return;
    }

    setIsCreatingProtected(true);
    setProtectedError(null);

    try {
      await createProtectedPersonalSpace(protectedPassword);
      setProtectedPassword("");
      setIsCreateProtectedOpen(false);
      await refreshWorkspaces({ silent: true });
    } catch (error) {
      setProtectedError(error instanceof Error ? error.message : t("navigation.protected.createError"));
    } finally {
      setIsCreatingProtected(false);
    }
  }

  const avatarLabel = user?.avatar_letter || user?.username.slice(0, 1).toUpperCase() || "T";
  const avatarSeed = user?.avatar_seed ?? user?.email ?? user?.username ?? user?.id ?? avatarLabel;
  const currentWorkspaceIcon = getWorkspaceIcon(currentWorkspace);

  return (
    <header className="navigation">
      <div className="navigation__inner app-container">
        <div className="navigation__left">
          <button className="navigation__brand" type="button" onClick={() => navigate("/dashboard")}>
            Time Tracking
          </button>

          <div className="navigation__workspace" ref={dropdownRef}>
            <span className="navigation__workspace-label">{t("navigation.workspace.label")}</span>

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
                {currentWorkspace?.name ?? t("navigation.workspace.label")}
              </span>

              <span className="navigation__workspace-chevron">
                <NavigationIcon name="chevron" />
              </span>
            </button>

            {isWorkspaceMenuOpen && (
              <div className="navigation__workspace-menu" role="menu">
                {personalWorkspaces.length > 0 && (
                  <div className="navigation__workspace-group">
                    <p>{t("navigation.workspace.personal")}</p>

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
                          <em>{getWorkspaceSubtitle(workspace, locale, plural)}</em>
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
                  <p>{t("navigation.workspace.protected")}</p>

                  {protectedWorkspace ? (
                    <button
                      className={`navigation__workspace-item${
                        protectedWorkspace.id === currentWorkspaceId ? " navigation__workspace-item--active" : ""
                      }`}
                      type="button"
                      key={protectedWorkspace.id}
                      onClick={() => handleWorkspaceSelect(protectedWorkspace.id)}
                      role="menuitem"
                    >
                      <span className="navigation__workspace-item-icon navigation__workspace-item-icon--protected">
                        <NavigationIcon name="lock" />
                      </span>

                      <span className="navigation__workspace-item-copy">
                        <strong>{protectedWorkspace.name}</strong>
                        <em>{t(protectedSpaceStatus?.is_unlocked ? "navigation.workspace.unlocked" : "navigation.workspace.locked")}</em>
                      </span>

                      {protectedWorkspace.id === currentWorkspaceId && (
                        <span className="navigation__workspace-item-check">
                          <NavigationIcon name="check" />
                        </span>
                      )}
                    </button>
                  ) : (
                    <button
                      className="navigation__workspace-create"
                      type="button"
                      onClick={openCreateProtectedModal}
                      role="menuitem"
                    >
                      <span>
                        <NavigationIcon name="lock" />
                      </span>
                      {t("navigation.workspace.createProtected")}
                    </button>
                  )}
                </div>

                <div className="navigation__workspace-group">
                  <p>{t("navigation.workspace.organizations")}</p>

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
                          <em>{getWorkspaceSubtitle(workspace, locale, plural)}</em>
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
                      {t("navigation.workspace.none")}
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
                  {t("navigation.workspace.createOrganization")}
                </button>
              </div>
            )}
          </div>
        </div>

        <nav className="navigation__links" aria-label={t("navigation.mainLabel")}>
          <NavLink to="/dashboard">{t("navigation.tasks")}</NavLink>
          <NavLink to="/projects">{t("navigation.projects")}</NavLink>
          <NavLink to="/reports">{t("navigation.reports")}</NavLink>
          <NavLink to="/team">{t("navigation.team")}</NavLink>
          <NavLink to="/profile">{t("navigation.profile")}</NavLink>
          <NavLink to="/settings/general">{t("navigation.settings")}</NavLink>
          {user?.role === "admin" && (
            <NavLink className="navigation__admin-link" to="/admin/overview">
              <NavigationIcon name="shield" />
              <span>{t("navigation.administration")}</span>
            </NavLink>
          )}
        </nav>

        <div className="navigation__user">
          <LanguageSwitcher />
          <NotificationsBell />

          <button
            className="navigation__avatar"
            type="button"
            aria-label={t("navigation.userProfile")}
            onClick={() => navigate("/profile")}
          >
            <GeneratedAvatar seed={avatarSeed} letter={avatarLabel} size={38} title={t("navigation.userProfile")} />
          </button>

          <span className="navigation__username">{user?.username ?? t("navigation.profile")}</span>

          <button className="navigation__logout" type="button" onClick={handleLogout}>
            {t("navigation.signOut")}
          </button>
        </div>
      </div>

      {isCreateWorkspaceOpen && createPortal(
        <div
          className="navigation-modal-backdrop"
          role="presentation"
          onClick={() => setIsCreateWorkspaceOpen(false)}
        >
          <form
            className="navigation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-workspace-title"
            onSubmit={handleCreateWorkspace}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="navigation-modal__header">
              <span>
                <NavigationIcon name="building" />
              </span>
              <div>
                <h2 id="create-workspace-title">{t("navigation.workspace.createOrganization")}</h2>
                <p>{t("navigation.organization.description")}</p>
              </div>
              <button
                className="navigation-modal__close"
                type="button"
                onClick={() => setIsCreateWorkspaceOpen(false)}
                aria-label={t("navigation.organization.closeLabel")}
              >
                ×
              </button>
            </div>

            <div className="navigation-modal__body">
              <label>
                <span>{t("navigation.organization.name")}</span>
                <input
                  type="text"
                  value={newWorkspaceName}
                  onChange={(event) => setNewWorkspaceName(event.target.value)}
                  placeholder={t("navigation.organization.namePlaceholder")}
                  autoFocus
                />
              </label>

              <label>
                <span>{t("navigation.organization.descriptionLabel")}</span>
                <textarea
                  value={newWorkspaceDescription}
                  onChange={(event) => setNewWorkspaceDescription(event.target.value)}
                  placeholder={t("navigation.organization.descriptionPlaceholder")}
                  rows={4}
                />
              </label>

              {createWorkspaceError && (
                <p className="navigation-modal__error">{createWorkspaceError}</p>
              )}
            </div>

            <div className="navigation-modal__actions">
              <button
                className="navigation-modal__button navigation-modal__button--primary"
                type="submit"
                disabled={isCreatingWorkspace}
              >
                {t(isCreatingWorkspace ? "common.actions.creating" : "common.actions.create")}
              </button>

              <button
                className="navigation-modal__button navigation-modal__button--secondary"
                type="button"
                onClick={() => setIsCreateWorkspaceOpen(false)}
              >
                {t("common.actions.cancel")}
              </button>
            </div>
          </form>
        </div>,
        document.body,
      )}

      {isCreateProtectedOpen && createPortal(
        <div
          className="navigation-modal-backdrop"
          role="presentation"
          onClick={() => setIsCreateProtectedOpen(false)}
        >
          <form
            className="navigation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-protected-title"
            onSubmit={handleCreateProtectedSpace}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="navigation-modal__header">
              <span>
                <NavigationIcon name="lock" />
              </span>
              <div>
                <h2 id="create-protected-title">{t("navigation.workspace.createProtected")}</h2>
                <p>{t("navigation.protected.description")}</p>
              </div>
              <button
                className="navigation-modal__close"
                type="button"
                onClick={() => setIsCreateProtectedOpen(false)}
                aria-label={t("navigation.protected.closeLabel")}
              >
                ×
              </button>
            </div>

            <div className="navigation-modal__body">
              <PasswordInput
                name="protected-password"
                label={t("navigation.protected.password")}
                value={protectedPassword}
                minLength={12}
                required
                autoComplete="new-password"
                placeholder={t("navigation.protected.passwordPlaceholder")}
                onChange={setProtectedPassword}
                error={protectedError ?? undefined}
              />
            </div>

            <div className="navigation-modal__actions">
              <button
                className="navigation-modal__button navigation-modal__button--primary"
                type="submit"
                disabled={isCreatingProtected}
              >
                {t(isCreatingProtected ? "common.actions.creating" : "common.actions.create")}
              </button>

              <button
                className="navigation-modal__button navigation-modal__button--secondary"
                type="button"
                onClick={() => setIsCreateProtectedOpen(false)}
              >
                {t("common.actions.cancel")}
              </button>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </header>
  );
}
