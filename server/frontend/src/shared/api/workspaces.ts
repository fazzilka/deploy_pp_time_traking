import { apiRequest, USE_MOCKS } from "./client";
import { mockWorkspaceMembers, mockWorkspaceMemberSummary, mockWorkspaces } from "./mockData";
import type {
  Workspace,
  WorkspaceCreateRequest,
  WorkspaceMember,
  WorkspaceMemberAddRequest,
  WorkspaceMemberSummaryResponse,
  WorkspaceMemberUpdateRequest,
  WorkspaceSummary,
  WorkspaceUpdateRequest,
} from "../types/workspace";

const workspacesStore: Workspace[] = mockWorkspaces.map((workspace) => ({ ...workspace }));
const membersStore: WorkspaceMember[] = mockWorkspaceMembers.map((member) => ({
  ...member,
  user: { ...member.user },
}));

function getWorkspaceOrThrow(workspaceId: number): Workspace {
  const workspace = workspacesStore.find((item) => item.id === workspaceId);
  if (!workspace) {
    throw new Error("Workspace не найден");
  }
  return workspace;
}

export async function getWorkspaces(): Promise<Workspace[]> {
  if (USE_MOCKS) {
    return workspacesStore;
  }

  return apiRequest<Workspace[]>("/api/v1/workspaces");
}

export async function createWorkspace(payload: WorkspaceCreateRequest): Promise<Workspace> {
  if (USE_MOCKS) {
    const now = new Date().toISOString();
    const workspace: Workspace = {
      id: Math.max(...workspacesStore.map((item) => item.id), 0) + 1,
      name: payload.name.trim(),
      description: payload.description?.trim() || null,
      type: "team",
      is_protected: false,
      owner_id: 1,
      created_at: now,
      updated_at: now,
      members_count: 1,
      projects_count: 0,
      tasks_count: 0,
      total_time_seconds: 0,
      current_user_role: "owner",
    };
    workspacesStore.push(workspace);
    return workspace;
  }

  return apiRequest<Workspace>("/api/v1/workspaces", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getWorkspace(workspaceId: number): Promise<Workspace> {
  if (USE_MOCKS) {
    return getWorkspaceOrThrow(workspaceId);
  }

  return apiRequest<Workspace>(`/api/v1/workspaces/${workspaceId}`);
}

export async function updateWorkspace(
  workspaceId: number,
  payload: WorkspaceUpdateRequest,
): Promise<Workspace> {
  if (USE_MOCKS) {
    const workspace = getWorkspaceOrThrow(workspaceId);
    Object.assign(workspace, payload, { updated_at: new Date().toISOString() });
    return workspace;
  }

  return apiRequest<Workspace>(`/api/v1/workspaces/${workspaceId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getWorkspaceMembers(workspaceId: number): Promise<WorkspaceMember[]> {
  if (USE_MOCKS) {
    return membersStore.filter((member) => member.workspace_id === workspaceId);
  }

  return apiRequest<WorkspaceMember[]>(`/api/v1/workspaces/${workspaceId}/members`);
}

export async function addWorkspaceMember(
  workspaceId: number,
  payload: WorkspaceMemberAddRequest,
): Promise<WorkspaceMember> {
  if (USE_MOCKS) {
    const exists = membersStore.some(
      (member) => member.workspace_id === workspaceId && member.user.email === payload.email,
    );
    if (exists) {
      throw new Error("Пользователь уже состоит в команде");
    }
    const member: WorkspaceMember = {
      id: Math.max(...membersStore.map((item) => item.id), 0) + 1,
      workspace_id: workspaceId,
      role: payload.role,
      status: "active",
      joined_at: new Date().toISOString(),
      projects_count: 0,
      tasks_count: 0,
      completed_tasks_count: 0,
      total_time_seconds: 0,
      user: {
        id: Date.now(),
        email: payload.email,
        username: payload.email.split("@")[0],
        full_name: null,
        avatar_letter: payload.email.slice(0, 1).toUpperCase(),
        avatar_seed: `mock-member-${payload.email}`,
        is_active: true,
      },
    };
    membersStore.push(member);
    getWorkspaceOrThrow(workspaceId).members_count += 1;
    return member;
  }

  return apiRequest<WorkspaceMember>(`/api/v1/workspaces/${workspaceId}/members`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateWorkspaceMember(
  workspaceId: number,
  memberId: number,
  payload: WorkspaceMemberUpdateRequest,
): Promise<WorkspaceMember> {
  if (USE_MOCKS) {
    const member = membersStore.find((item) => item.workspace_id === workspaceId && item.id === memberId);
    if (!member) {
      throw new Error("Участник не найден");
    }
    Object.assign(member, payload);
    return member;
  }

  return apiRequest<WorkspaceMember>(`/api/v1/workspaces/${workspaceId}/members/${memberId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function removeWorkspaceMember(workspaceId: number, memberId: number): Promise<void> {
  if (USE_MOCKS) {
    const index = membersStore.findIndex((item) => item.workspace_id === workspaceId && item.id === memberId);
    if (index >= 0) {
      membersStore.splice(index, 1);
      getWorkspaceOrThrow(workspaceId).members_count = Math.max(1, getWorkspaceOrThrow(workspaceId).members_count - 1);
    }
    return;
  }

  await apiRequest<void>(`/api/v1/workspaces/${workspaceId}/members/${memberId}`, {
    method: "DELETE",
  });
}

export async function leaveWorkspace(workspaceId: number): Promise<void> {
  if (USE_MOCKS) {
    const workspaceIndex = workspacesStore.findIndex((workspace) => workspace.id === workspaceId);
    if (workspaceIndex >= 0 && workspacesStore[workspaceIndex].type !== "personal") {
      workspacesStore.splice(workspaceIndex, 1);
    }
    const memberIndex = membersStore.findIndex((member) => member.workspace_id === workspaceId);
    if (memberIndex >= 0) {
      membersStore.splice(memberIndex, 1);
    }
    return;
  }

  await apiRequest<void>(`/api/v1/workspaces/${workspaceId}/leave`, {
    method: "POST",
  });
}

export async function getWorkspaceSummary(workspaceId: number): Promise<WorkspaceSummary> {
  if (USE_MOCKS) {
    const workspace = getWorkspaceOrThrow(workspaceId);
    return {
      workspace,
      members_count: workspace.members_count,
      active_members_count: membersStore.filter(
        (member) => member.workspace_id === workspaceId && member.status === "active",
      ).length,
      projects_count: workspace.projects_count,
      active_projects_count: workspace.projects_count,
      tasks_count: workspace.tasks_count,
      active_tasks_count: 0,
      completed_tasks_count: 0,
      total_time_seconds: workspace.total_time_seconds,
    };
  }

  return apiRequest<WorkspaceSummary>(`/api/v1/workspaces/${workspaceId}/summary`);
}

export async function getWorkspaceMemberSummary(
  workspaceId: number,
): Promise<WorkspaceMemberSummaryResponse> {
  if (USE_MOCKS) {
    return {
      items: mockWorkspaceMemberSummary.filter((item) =>
        membersStore.some((member) => member.workspace_id === workspaceId && member.user.id === item.user.id),
      ),
    };
  }

  return apiRequest<WorkspaceMemberSummaryResponse>(`/api/v1/workspaces/${workspaceId}/members/summary`);
}
