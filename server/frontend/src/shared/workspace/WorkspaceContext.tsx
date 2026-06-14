import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getWorkspaces } from "../api/workspaces";
import { resetProjectsDataCache } from "../api/projects";
import { clearReportsCache } from "../api/reports";
import type { Workspace, WorkspaceRole } from "../types/workspace";

const STORAGE_KEY = "time_tracking_current_workspace_id";

type WorkspaceContextValue = {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  currentWorkspaceId: number | null;
  currentUserRole: WorkspaceRole | null;
  isLoading: boolean;
  error: string | null;
  setCurrentWorkspaceId: (workspaceId: number) => void;
  refreshWorkspaces: () => Promise<void>;
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

  const currentWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === currentWorkspaceId) ?? workspaces[0] ?? null,
    [currentWorkspaceId, workspaces],
  );

  const setCurrentWorkspaceId = useCallback((workspaceId: number) => {
    localStorage.setItem(STORAGE_KEY, String(workspaceId));
    setCurrentWorkspaceIdState(workspaceId);
    resetProjectsDataCache();
    clearReportsCache();
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const nextWorkspaces = await getWorkspaces();
      setWorkspaces(nextWorkspaces);
      const storedWorkspaceId = readStoredWorkspaceId();
      const nextCurrentWorkspace =
        nextWorkspaces.find((workspace) => workspace.id === storedWorkspaceId) ?? nextWorkspaces[0] ?? null;
      if (nextCurrentWorkspace) {
        localStorage.setItem(STORAGE_KEY, String(nextCurrentWorkspace.id));
        setCurrentWorkspaceIdState(nextCurrentWorkspace.id);
      } else {
        localStorage.removeItem(STORAGE_KEY);
        setCurrentWorkspaceIdState(null);
      }
    } catch {
      setError("Не удалось загрузить workspace");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshWorkspaces();
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
    }),
    [currentWorkspace, error, isLoading, refreshWorkspaces, setCurrentWorkspaceId, workspaces],
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
  return role === "owner" || role === "team_lead" || role === "member";
}

export function canCreateTasks(role: WorkspaceRole | null): boolean {
  return role === "owner" || role === "team_lead" || role === "member";
}

export function canEditWorkspace(role: WorkspaceRole | null): boolean {
  return role === "owner";
}
