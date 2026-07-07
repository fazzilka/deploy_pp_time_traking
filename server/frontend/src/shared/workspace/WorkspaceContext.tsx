import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  clearProtectedVaultToken,
  createProtectedSpace,
  getProtectedSpaceStatus,
  lockProtectedSpace as lockProtectedSpaceRequest,
  unlockProtectedSpace,
} from "../api/protectedSpace";
import { createWorkspace, getWorkspaces, updateWorkspace } from "../api/workspaces";
import { resetProjectsDataCache } from "../api/projects";
import { clearTaskCommentsCacheForWorkspace } from "../api/taskComments";
import {
  cancelScheduledReportsRefresh,
  ensureReportsLoaded,
  handleReportsEvent,
  scheduleReportsRefreshForWorkspace,
} from "../api/reports";
import {
  subscribeToUserEvents,
  USER_EVENTS_STATUS_EVENT,
  type UserEventsConnectionStatus,
} from "../events/userEvents";
import type { Workspace, WorkspaceCreateRequest, WorkspaceRole, WorkspaceUpdateRequest } from "../types/workspace";
import type { ProtectedSpaceStatus } from "../types/protectedSpace";

const STORAGE_KEY = "time_tracking_current_workspace_id";

type WorkspaceContextValue = {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  currentWorkspaceId: number | null;
  currentUserRole: WorkspaceRole | null;
  isLoading: boolean;
  error: string | null;
  setCurrentWorkspaceId: (workspaceId: number) => void;
  refreshWorkspaces: (options?: { silent?: boolean }) => Promise<void>;
  removeWorkspaceFromState: (workspaceId: number) => void;
  createOrganization: (payload: WorkspaceCreateRequest) => Promise<Workspace>;
  updateCurrentWorkspace: (payload: WorkspaceUpdateRequest) => Promise<Workspace | null>;
  protectedSpaceStatus: ProtectedSpaceStatus | null;
  isCurrentWorkspaceProtectedLocked: boolean;
  refreshProtectedSpaceStatus: () => Promise<void>;
  createProtectedPersonalSpace: (password: string) => Promise<void>;
  unlockProtectedPersonalSpace: (password: string) => Promise<void>;
  lockProtectedPersonalSpace: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function readStoredWorkspaceId(): number | null {
  const rawValue = localStorage.getItem(STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspaceId, setCurrentWorkspaceIdState] = useState<number | null>(readStoredWorkspaceId);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [protectedSpaceStatus, setProtectedSpaceStatus] = useState<ProtectedSpaceStatus | null>(null);
  const refreshDebounceRef = useRef<number | null>(null);
  const protectedExpiryTimerRef = useRef<number | null>(null);
  const hiddenLockTimerRef = useRef<number | null>(null);
  const currentWorkspaceIdRef = useRef<number | null>(currentWorkspaceId);
  const hasConnectedEventsRef = useRef(false);
  const lastEventsStatusRef = useRef<UserEventsConnectionStatus>("idle");

  const currentWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === currentWorkspaceId) ?? workspaces[0] ?? null,
    [currentWorkspaceId, workspaces],
  );
  const isCurrentWorkspaceProtectedLocked = Boolean(
    currentWorkspace?.is_protected
      && (!protectedSpaceStatus?.is_unlocked || protectedSpaceStatus.workspace_id !== currentWorkspace.id),
  );

  const refreshProtectedSpaceStatus = useCallback(async () => {
    try {
      setProtectedSpaceStatus(await getProtectedSpaceStatus());
    } catch {
      setProtectedSpaceStatus(null);
    }
  }, []);

  const setCurrentWorkspaceId = useCallback((workspaceId: number) => {
    localStorage.setItem(STORAGE_KEY, String(workspaceId));
    setCurrentWorkspaceIdState(workspaceId);
    resetProjectsDataCache();
  }, []);

  const setResolvedCurrentWorkspaceId = useCallback((workspaceId: number | null) => {
    if (workspaceId === null) {
      localStorage.removeItem(STORAGE_KEY);
      setCurrentWorkspaceIdState(null);
      resetProjectsDataCache();
      return;
    }

    localStorage.setItem(STORAGE_KEY, String(workspaceId));
    setCurrentWorkspaceIdState((currentId) => {
      if (currentId !== workspaceId) {
        resetProjectsDataCache();
      }
      return workspaceId;
    });
  }, []);

  const refreshWorkspaces = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const [nextWorkspaces] = await Promise.all([
        getWorkspaces(),
        refreshProtectedSpaceStatus(),
      ]);
      setWorkspaces(nextWorkspaces);
      const storedWorkspaceId = readStoredWorkspaceId();
      const nextCurrentWorkspace =
        nextWorkspaces.find((workspace) => workspace.id === storedWorkspaceId) ?? nextWorkspaces[0] ?? null;
      if (nextCurrentWorkspace) {
        setResolvedCurrentWorkspaceId(nextCurrentWorkspace.id);
      } else {
        setResolvedCurrentWorkspaceId(null);
      }
    } catch {
      setError("Не удалось загрузить workspace");
    } finally {
      if (!options?.silent) {
        setIsLoading(false);
      }
    }
  }, [refreshProtectedSpaceStatus, setResolvedCurrentWorkspaceId]);

  const removeWorkspaceFromState = useCallback(
    (workspaceId: number) => {
      setWorkspaces((currentWorkspaces) => {
        const nextWorkspaces = currentWorkspaces.filter((workspace) => workspace.id !== workspaceId);
        if (currentWorkspaceId === workspaceId) {
          setResolvedCurrentWorkspaceId(nextWorkspaces[0]?.id ?? null);
        }
        return nextWorkspaces;
      });
    },
    [currentWorkspaceId, setResolvedCurrentWorkspaceId],
  );

  const scheduleSilentRefresh = useCallback(() => {
    if (refreshDebounceRef.current !== null) {
      window.clearTimeout(refreshDebounceRef.current);
    }
    refreshDebounceRef.current = window.setTimeout(() => {
      refreshDebounceRef.current = null;
      void refreshWorkspaces({ silent: true });
    }, 300);
  }, [refreshWorkspaces]);

  const createOrganization = useCallback(
    async (payload: WorkspaceCreateRequest) => {
      const createdWorkspace = await createWorkspace({ ...payload, type: "team" });
      setWorkspaces((currentWorkspaces) => {
        const withoutDuplicate = currentWorkspaces.filter((workspace) => workspace.id !== createdWorkspace.id);
        return [...withoutDuplicate, createdWorkspace];
      });
      setCurrentWorkspaceId(createdWorkspace.id);
      return createdWorkspace;
    },
    [setCurrentWorkspaceId],
  );

  const updateCurrentWorkspace = useCallback(
    async (payload: WorkspaceUpdateRequest) => {
      const workspaceId = currentWorkspace?.id;
      if (!workspaceId) {
        return null;
      }
      const updatedWorkspace = await updateWorkspace(workspaceId, payload);
      setWorkspaces((currentWorkspaces) =>
        currentWorkspaces.map((workspace) => (workspace.id === updatedWorkspace.id ? updatedWorkspace : workspace)),
      );
      setCurrentWorkspaceId(updatedWorkspace.id);
      return updatedWorkspace;
    },
    [currentWorkspace?.id, setCurrentWorkspaceId],
  );

  const createProtectedPersonalSpace = useCallback(
    async (password: string) => {
      await createProtectedSpace(password);
      await refreshProtectedSpaceStatus();
      await refreshWorkspaces({ silent: true });
    },
    [refreshProtectedSpaceStatus, refreshWorkspaces],
  );

  const unlockProtectedPersonalSpace = useCallback(
    async (password: string) => {
      const response = await unlockProtectedSpace(password);
      setProtectedSpaceStatus({
        exists: true,
        workspace_id: response.workspace_id,
        is_unlocked: true,
        expires_at: response.expires_at,
      });
      await refreshWorkspaces({ silent: true });
      setResolvedCurrentWorkspaceId(response.workspace_id);
    },
    [refreshWorkspaces, setResolvedCurrentWorkspaceId],
  );

  const lockProtectedPersonalSpace = useCallback(async () => {
    const lockedWorkspaceId = protectedSpaceStatus?.workspace_id ?? null;
    await lockProtectedSpaceRequest();
    setProtectedSpaceStatus((currentStatus) =>
      currentStatus
        ? { ...currentStatus, is_unlocked: false, expires_at: null }
        : currentStatus,
    );
    if (lockedWorkspaceId !== null && currentWorkspaceIdRef.current === lockedWorkspaceId) {
      const fallbackWorkspace = workspaces.find((workspace) => !workspace.is_protected) ?? null;
      setResolvedCurrentWorkspaceId(fallbackWorkspace?.id ?? null);
    }
  }, [protectedSpaceStatus?.workspace_id, setResolvedCurrentWorkspaceId, workspaces]);

  useEffect(() => {
    void refreshWorkspaces();
  }, [refreshWorkspaces]);

  useEffect(() => {
    return subscribeToUserEvents({
      onEvent: (event, payload) => {
        if (event === "workspace.membership.changed") {
          if (
            "workspace_id" in payload
            && "reason" in payload
            && (payload.reason === "removed" || payload.reason === "left")
            && typeof payload.workspace_id === "number"
          ) {
            removeWorkspaceFromState(payload.workspace_id);
          }
          scheduleSilentRefresh();
        }
        if (event === "protected_space.locked") {
          const lockedWorkspaceId =
            "workspace_id" in payload && typeof payload.workspace_id === "number"
              ? payload.workspace_id
              : protectedSpaceStatus?.workspace_id;
          if (typeof lockedWorkspaceId === "number") {
            clearTaskCommentsCacheForWorkspace(lockedWorkspaceId);
          }
          clearProtectedVaultToken();
          setProtectedSpaceStatus((currentStatus) =>
            currentStatus
              ? { ...currentStatus, is_unlocked: false, expires_at: null }
              : currentStatus,
          );
        }
        if (event === "protected_space.changed" || event === "protected_space.unlocked") {
          void refreshProtectedSpaceStatus();
        }
        handleReportsEvent(event, payload, currentWorkspaceIdRef.current);
      },
    });
  }, [protectedSpaceStatus?.workspace_id, refreshProtectedSpaceStatus, removeWorkspaceFromState, scheduleSilentRefresh]);

  useEffect(() => {
    currentWorkspaceIdRef.current = currentWorkspace?.id ?? null;
    if (currentWorkspace?.id !== undefined) {
      cancelScheduledReportsRefresh();
      void ensureReportsLoaded(currentWorkspace.id).catch(() => undefined);
    }
  }, [currentWorkspace?.id]);

  useEffect(() => {
    const handleEventsStatus = (event: Event) => {
      const status = (event as CustomEvent<{ status: UserEventsConnectionStatus }>).detail?.status;
      if (!status) {
        return;
      }

      const previousStatus = lastEventsStatusRef.current;
      lastEventsStatusRef.current = status;
      if (status === "connected") {
        if (hasConnectedEventsRef.current && previousStatus !== "connected" && currentWorkspaceIdRef.current !== null) {
          scheduleReportsRefreshForWorkspace(currentWorkspaceIdRef.current);
        }
        hasConnectedEventsRef.current = true;
      }
    };

    window.addEventListener(USER_EVENTS_STATUS_EVENT, handleEventsStatus);
    return () => window.removeEventListener(USER_EVENTS_STATUS_EVENT, handleEventsStatus);
  }, []);

  useEffect(() => {
    return () => {
      if (refreshDebounceRef.current !== null) {
        window.clearTimeout(refreshDebounceRef.current);
      }
      cancelScheduledReportsRefresh();
      clearProtectedVaultToken();
    };
  }, []);

  useEffect(() => {
    if (protectedExpiryTimerRef.current !== null) {
      window.clearTimeout(protectedExpiryTimerRef.current);
      protectedExpiryTimerRef.current = null;
    }
    if (!protectedSpaceStatus?.is_unlocked || !protectedSpaceStatus.expires_at) {
      return undefined;
    }
    const expiresInMs = new Date(protectedSpaceStatus.expires_at).getTime() - Date.now();
    protectedExpiryTimerRef.current = window.setTimeout(() => {
      void lockProtectedPersonalSpace().catch(() => undefined);
    }, Math.max(0, expiresInMs));
    return () => {
      if (protectedExpiryTimerRef.current !== null) {
        window.clearTimeout(protectedExpiryTimerRef.current);
        protectedExpiryTimerRef.current = null;
      }
    };
  }, [lockProtectedPersonalSpace, protectedSpaceStatus?.expires_at, protectedSpaceStatus?.is_unlocked]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (!protectedSpaceStatus?.is_unlocked) {
        return;
      }
      if (document.visibilityState === "hidden") {
        hiddenLockTimerRef.current = window.setTimeout(() => {
          void lockProtectedPersonalSpace().catch(() => undefined);
        }, 120000);
        return;
      }
      if (hiddenLockTimerRef.current !== null) {
        window.clearTimeout(hiddenLockTimerRef.current);
        hiddenLockTimerRef.current = null;
      }
      void refreshProtectedSpaceStatus();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (hiddenLockTimerRef.current !== null) {
        window.clearTimeout(hiddenLockTimerRef.current);
      }
    };
  }, [lockProtectedPersonalSpace, protectedSpaceStatus?.is_unlocked, refreshProtectedSpaceStatus]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshWorkspaces({ silent: true });
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, [refreshWorkspaces]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaces,
      currentWorkspace,
      currentWorkspaceId: currentWorkspace?.id ?? null,
      currentUserRole: currentWorkspace?.current_user_role ?? null,
      isLoading,
      error,
      setCurrentWorkspaceId,
      refreshWorkspaces,
      removeWorkspaceFromState,
      createOrganization,
      updateCurrentWorkspace,
      protectedSpaceStatus,
      isCurrentWorkspaceProtectedLocked,
      refreshProtectedSpaceStatus,
      createProtectedPersonalSpace,
      unlockProtectedPersonalSpace,
      lockProtectedPersonalSpace,
    }),
    [
      createOrganization,
      currentWorkspace,
      error,
      isLoading,
      removeWorkspaceFromState,
      refreshWorkspaces,
      setCurrentWorkspaceId,
      updateCurrentWorkspace,
      protectedSpaceStatus,
      isCurrentWorkspaceProtectedLocked,
      refreshProtectedSpaceStatus,
      createProtectedPersonalSpace,
      unlockProtectedPersonalSpace,
      lockProtectedPersonalSpace,
      workspaces,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider");
  }
  return context;
}

export function canManageMembers(role: WorkspaceRole | null): boolean {
  return role === "owner" || role === "team_lead";
}

export function canCreateProjects(role: WorkspaceRole | null): boolean {
  return role === "owner" || role === "team_lead";
}

export function canCreateTasks(role: WorkspaceRole | null): boolean {
  return role === "owner" || role === "team_lead" || role === "member";
}

export function canDeleteTasks(role: WorkspaceRole | null): boolean {
  return role === "owner" || role === "team_lead";
}

export function canEditWorkspace(role: WorkspaceRole | null): boolean {
  return role === "owner";
}
