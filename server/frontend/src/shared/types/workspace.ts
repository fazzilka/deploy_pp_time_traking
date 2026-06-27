export type WorkspaceType = "personal" | "team";

export type WorkspaceRole = "owner" | "team_lead" | "member" | "viewer";

export type WorkspaceMemberStatus = "active" | "inactive";

export type Workspace = {
  id: number;
  name: string;
  description: string | null;
  type: WorkspaceType;
  is_protected: boolean;
  owner_id: number;
  created_at: string;
  updated_at: string;
  members_count: number;
  projects_count: number;
  tasks_count: number;
  total_time_seconds: number;
  current_user_role: WorkspaceRole;
};

export type WorkspaceMemberUser = {
  id: number;
  email: string;
  username: string;
  full_name: string | null;
  avatar_letter: string;
  avatar_seed?: string | null;
  is_active: boolean;
};

export type WorkspaceMember = {
  id: number;
  workspace_id: number;
  user: WorkspaceMemberUser;
  role: WorkspaceRole;
  status: WorkspaceMemberStatus;
  joined_at: string;
  projects_count: number;
  tasks_count: number;
  completed_tasks_count: number;
  total_time_seconds: number;
};

export type WorkspaceCreateRequest = {
  name: string;
  description?: string | null;
  type?: WorkspaceType;
};

export type WorkspaceUpdateRequest = {
  name?: string;
  description?: string | null;
};

export type WorkspaceMemberAddRequest = {
  email: string;
  role: WorkspaceRole;
};

export type WorkspaceMemberUpdateRequest = {
  role?: WorkspaceRole;
  status?: WorkspaceMemberStatus;
};

export type WorkspaceMemberSummaryItem = {
  user: WorkspaceMemberUser;
  role: WorkspaceRole;
  status: WorkspaceMemberStatus;
  tasks_count: number;
  completed_tasks_count: number;
  projects_count: number;
  total_time_seconds: number;
};

export type WorkspaceMemberSummaryResponse = {
  items: WorkspaceMemberSummaryItem[];
};

export type WorkspaceSummary = {
  workspace: Workspace;
  members_count: number;
  active_members_count: number;
  projects_count: number;
  active_projects_count: number;
  tasks_count: number;
  active_tasks_count: number;
  completed_tasks_count: number;
  total_time_seconds: number;
};
