import { apiRequest, USE_MOCKS } from "./client";
import { mockProjects } from "./mockData";
import { getTasks } from "./tasks";
import {
  applyTaskProjectChangeToProjectsCache,
  getCachedProjects,
  getCachedProjectsTimeSummary,
  invalidateProjectsListCache,
  invalidateProjectsTimeSummaryCache,
  removeCachedProject,
  resetProjectsCache,
  setCachedProjects,
  setCachedProjectsTimeSummary,
  updateCachedProjectIdentity,
} from "./projectsCache";
import type {
  Project,
  ProjectCreateRequest,
  ProjectListItem,
  ProjectSummary,
  ProjectTimeSummaryItem,
  ProjectsTimeSummaryResponse,
  ProjectUpdateRequest,
} from "../types/project";
import type { Task, TaskQuery } from "../types/task";

const projectsStore: ProjectListItem[] = mockProjects.map((project) => ({ ...project }));
const pendingProjectRequests = new Map<string, Promise<unknown>>();

function serializeProjectParams(
  params: { includeArchived?: boolean; search?: string; workspaceId?: number } = {},
): string {
  const searchParams = new URLSearchParams();

  if (params.includeArchived) {
    searchParams.set("include_archived", "true");
  }

  if (params.search) {
    searchParams.set("search", params.search);
  }

  if (params.workspaceId !== undefined) {
    searchParams.set("workspace_id", String(params.workspaceId));
  }

  const search = searchParams.toString();
  return search ? `?${search}` : "";
}

function serializeTaskQuery(query: TaskQuery = {}): string {
  const params = new URLSearchParams();

  if (query.search) {
    params.set("search", query.search);
  }

  if (query.hasTime) {
    params.set("has_time", "true");
  }

  if (query.priority) {
    params.set("priority", query.priority);
  }

  if (query.workspaceId !== undefined) {
    params.set("workspace_id", String(query.workspaceId));
  }

  if (query.deadlineBefore) {
    params.set("deadline_before", query.deadlineBefore);
  }

  if (query.deadlineAfter) {
    params.set("deadline_after", query.deadlineAfter);
  }

  if (query.limit !== undefined) {
    params.set("limit", String(query.limit));
  }

  if (query.offset !== undefined) {
    params.set("offset", String(query.offset));
  }

  const search = params.toString();
  return search ? `?${search}` : "";
}

function toProject(project: ProjectListItem): Project {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    color: project.color,
    icon: project.icon ?? "folder",
    is_archived: project.is_archived,
    created_at: project.created_at,
    updated_at: project.updated_at,
  };
}

function getProjectById(projectId: number): ProjectListItem {
  const project = projectsStore.find((item) => item.id === projectId);

  if (!project) {
    throw new Error("Проект не найден");
  }

  return project;
}

function buildProjectStats(project: ProjectListItem, tasks: Task[]): ProjectListItem {
  const projectTasks = tasks.filter(
    (task) => task.project_id === project.id && task.workspace_id === project.workspace_id,
  );

  return {
    ...project,
    tasks_count: projectTasks.length,
    active_tasks_count: projectTasks.filter((task) =>
      task.time_intervals?.some((interval) => interval.ended_at === null),
    ).length,
    tasks_with_time_count: projectTasks.filter((task) => task.total_time_seconds > 0).length,
    total_time_seconds: projectTasks.reduce((sum, task) => sum + task.total_time_seconds, 0),
  };
}

async function buildMockProjects(): Promise<ProjectListItem[]> {
  const tasks = await getTasks();
  return projectsStore.map((project) => buildProjectStats(project, tasks));
}

function rememberPending<T>(key: string, request: Promise<T>): Promise<T> {
  pendingProjectRequests.set(key, request);
  return request.finally(() => {
    pendingProjectRequests.delete(key);
  });
}

function getPending<T>(key: string): Promise<T> | null {
  return (pendingProjectRequests.get(key) as Promise<T> | undefined) ?? null;
}

export function getMockProjectBadge(projectId: number | null | undefined) {
  if (projectId == null) {
    return null;
  }

  const project = projectsStore.find((item) => item.id === projectId);
  return project
    ? { id: project.id, name: project.name, color: project.color, icon: project.icon ?? "folder" }
    : null;
}

export function invalidateProjectsCache(): void {
  invalidateProjectsListCache();
  invalidateProjectsTimeSummaryCache();
  pendingProjectRequests.clear();
}

export function ensureProjectsLoaded(options: { force?: boolean; workspaceId?: number } = {}): Promise<ProjectListItem[]> {
  if (options.force) {
    invalidateProjectsListCache();
    pendingProjectRequests.delete(`/api/v1/projects${serializeProjectParams({ workspaceId: options.workspaceId })}`);
  } else {
    const cachedProjects = options.workspaceId === undefined ? getCachedProjects() : null;
    if (cachedProjects) {
      return Promise.resolve(cachedProjects);
    }
  }

  return getProjects({ workspaceId: options.workspaceId });
}

export async function getProjects(
  params: { includeArchived?: boolean; search?: string; workspaceId?: number } = {},
): Promise<ProjectListItem[]> {
  const query = serializeProjectParams(params);
  const path = `/api/v1/projects${query}`;

  if (USE_MOCKS) {
    const search = params.search?.trim().toLowerCase();
    const projects = await buildMockProjects();
    return projects.filter((project) => {
      const matchesArchive = params.includeArchived || !project.is_archived;
      const matchesSearch = !search || project.name.toLowerCase().includes(search);
      const matchesWorkspace = params.workspaceId === undefined || project.workspace_id === params.workspaceId;
      return matchesArchive && matchesSearch && matchesWorkspace;
    });
  }

  if (!query) {
    const cachedProjects = getCachedProjects();
    if (cachedProjects) {
      return cachedProjects;
    }
  }

  const pendingRequest = getPending<ProjectListItem[]>(path);
  if (pendingRequest) {
    return pendingRequest;
  }

  return rememberPending(
    path,
    apiRequest<ProjectListItem[]>(path).then((projects) => {
      if (!query) {
        setCachedProjects(projects);
      }
      return projects;
    }),
  );
}

export async function createProject(payload: ProjectCreateRequest): Promise<Project> {
  if (USE_MOCKS) {
    const now = new Date().toISOString();
    const project: ProjectListItem = {
      id: Math.max(...projectsStore.map((item) => item.id), 0) + 1,
      workspace_id: payload.workspace_id ?? 1,
      name: payload.name.trim(),
      description: payload.description?.trim() || null,
      color: payload.color,
      icon: payload.icon,
      is_archived: false,
      created_at: now,
      updated_at: now,
      tasks_count: 0,
      active_tasks_count: 0,
      tasks_with_time_count: 0,
      total_time_seconds: 0,
    };

    projectsStore.unshift(project);
    invalidateProjectsCache();
    return toProject(project);
  }

  const project = await apiRequest<Project>("/api/v1/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  invalidateProjectsCache();
  return project;
}

export async function getProject(projectId: number): Promise<Project> {
  const path = `/api/v1/projects/${projectId}`;

  if (USE_MOCKS) {
    return toProject(getProjectById(projectId));
  }

  const pendingRequest = getPending<Project>(path);
  if (pendingRequest) {
    return pendingRequest;
  }

  return rememberPending(path, apiRequest<Project>(path));
}

export async function updateProject(projectId: number, payload: ProjectUpdateRequest): Promise<Project> {
  if (USE_MOCKS) {
    const project = getProjectById(projectId);
    Object.assign(project, {
      ...payload,
      name: payload.name?.trim() ?? project.name,
      description:
        payload.description === undefined ? project.description : payload.description?.trim() || null,
      updated_at: new Date().toISOString(),
    });
    updateCachedProjectIdentity(toProject(project));
    return toProject(project);
  }

  const project = await apiRequest<Project>(`/api/v1/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  updateCachedProjectIdentity(project);
  return project;
}

export async function archiveProject(projectId: number): Promise<void> {
  if (USE_MOCKS) {
    const project = getProjectById(projectId);
    project.is_archived = true;
    project.updated_at = new Date().toISOString();
    removeCachedProject(projectId);
    return;
  }

  await apiRequest<void>(`/api/v1/projects/${projectId}`, {
    method: "DELETE",
  });
  removeCachedProject(projectId);
}

export async function getProjectSummary(projectId: number, limit = 5): Promise<ProjectSummary> {
  const path = `/api/v1/projects/${projectId}/summary?limit=${limit}`;

  if (USE_MOCKS) {
    const project = getProjectById(projectId);
    const tasks = (await getTasks({ projectId, limit: 100 })).filter((task) => task.total_time_seconds > 0);
    const topTasks = tasks
      .sort((firstTask, secondTask) => secondTask.total_time_seconds - firstTask.total_time_seconds)
      .slice(0, limit)
      .map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        total_time_seconds: task.total_time_seconds,
        deadline: task.deadline,
        priority: task.priority,
      }));
    const stats = buildProjectStats(project, await getTasks());

    return {
      ...toProject(project),
      tasks_count: stats.tasks_count,
      active_tasks_count: stats.active_tasks_count,
      tasks_with_time_count: stats.tasks_with_time_count,
      total_time_seconds: stats.total_time_seconds,
      top_tasks: topTasks,
    };
  }

  const pendingRequest = getPending<ProjectSummary>(path);
  if (pendingRequest) {
    return pendingRequest;
  }

  return rememberPending(path, apiRequest<ProjectSummary>(path));
}

export async function getProjectTasks(projectId: number, query: TaskQuery = {}): Promise<Task[]> {
  if (USE_MOCKS) {
    return getTasks({ ...query, projectId });
  }

  return apiRequest<Task[]>(`/api/v1/projects/${projectId}/tasks${serializeTaskQuery(query)}`);
}

export async function getProjectsTimeSummary(
  workspaceId?: number,
  options: { force?: boolean } = {},
): Promise<ProjectsTimeSummaryResponse> {
  const query = workspaceId !== undefined ? `?workspace_id=${workspaceId}` : "";
  const path = `/api/v1/summary/projects${query}`;

  if (USE_MOCKS) {
    const tasks = await getTasks({ limit: 100, workspaceId });
    const byProject = new Map<number | null, ProjectTimeSummaryItem>();

    tasks.forEach((task) => {
      const project = getMockProjectBadge(task.project_id);
      const projectId = project?.id ?? null;
      const current = byProject.get(projectId) ?? {
        project_id: projectId,
        name: project?.name ?? "Без проекта",
        color: project?.color ?? "#8b949e",
        icon: project?.icon ?? (projectId === null ? "briefcase" : "folder"),
        tasks_count: 0,
        active_tasks_count: 0,
        total_time_seconds: 0,
        percentage: 0,
      };

      current.tasks_count += 1;
      current.total_time_seconds += task.total_time_seconds;
      if (task.time_intervals?.some((interval) => interval.ended_at === null)) {
        current.active_tasks_count += 1;
      }
      byProject.set(projectId, current);
    });

    const items = Array.from(byProject.values()).sort(
      (firstItem, secondItem) => secondItem.total_time_seconds - firstItem.total_time_seconds,
    );
    const totalTime = items.reduce((sum, item) => sum + item.total_time_seconds, 0);

    return {
      items: items.map((item) => ({
        ...item,
        percentage: totalTime > 0 ? Math.round((item.total_time_seconds / totalTime) * 10000) / 100 : 0,
      })),
      total_time_seconds: totalTime,
    };
  }

  if (options.force) {
    if (workspaceId === undefined) {
      invalidateProjectsTimeSummaryCache();
    }
    pendingProjectRequests.delete(path);
  }

  const cachedSummary = !options.force && workspaceId === undefined ? getCachedProjectsTimeSummary() : null;
  if (cachedSummary) {
    return cachedSummary;
  }

  const pendingRequest = getPending<ProjectsTimeSummaryResponse>(path);
  if (!options.force && pendingRequest) {
    return pendingRequest;
  }

  return rememberPending(
    path,
    apiRequest<ProjectsTimeSummaryResponse>(path).then((summary) => {
      if (workspaceId === undefined) {
        setCachedProjectsTimeSummary(summary);
      }
      return summary;
    }),
  );
}

export function applyProjectsTaskChange(change: {
  previousTask: Task | null;
  nextTask: Task | null;
}): void {
  applyTaskProjectChangeToProjectsCache(change);
}

export function resetProjectsDataCache(): void {
  resetProjectsCache();
  pendingProjectRequests.clear();
}
