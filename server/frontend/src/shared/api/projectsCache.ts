import type { Task } from "../types/task";
import type {
  ProjectListItem,
  ProjectTimeSummaryItem,
  ProjectsTimeSummaryResponse,
} from "../types/project";

type ProjectTaskChange = {
  previousTask: Task | null;
  nextTask: Task | null;
};

let projectsListCache: ProjectListItem[] | null = null;
let projectsTimeSummaryCache: ProjectsTimeSummaryResponse | null = null;

function isTaskActive(task: Task | null): boolean {
  return Boolean(task?.time_intervals?.some((interval) => interval.ended_at === null));
}

function getTaskProjectId(task: Task | null): number | null {
  return task?.project_id ?? null;
}

function getProjectListItem(projectId: number): ProjectListItem | null {
  return projectsListCache?.find((project) => project.id === projectId) ?? null;
}

function getSummaryItem(projectId: number | null): ProjectTimeSummaryItem | null {
  return projectsTimeSummaryCache?.items.find((item) => item.project_id === projectId) ?? null;
}

function updateProjectListItem(
  projectId: number,
  updater: (project: ProjectListItem) => ProjectListItem,
): void {
  if (!projectsListCache) {
    return;
  }

  const nextProjects = projectsListCache.map((project) => (project.id === projectId ? updater(project) : project));
  projectsListCache = nextProjects;
}

function updateSummaryItem(
  projectId: number | null,
  updater: (project: ProjectTimeSummaryItem) => ProjectTimeSummaryItem,
): void {
  if (!projectsTimeSummaryCache) {
    return;
  }

  const currentItem = projectsTimeSummaryCache.items.find((item) => item.project_id === projectId) ?? null;
  const nextItems = currentItem
    ? projectsTimeSummaryCache.items.map((item) => (item.project_id === projectId ? updater(item) : item))
    : [...projectsTimeSummaryCache.items, updater(createSummaryItem(projectId))];

  const nextTotalTime = nextItems.reduce((sum, item) => sum + item.total_time_seconds, 0);
  const sortedItems = nextItems.sort((firstItem, secondItem) => {
    if (secondItem.total_time_seconds !== firstItem.total_time_seconds) {
      return secondItem.total_time_seconds - firstItem.total_time_seconds;
    }

    if (firstItem.project_id === null) {
      return 1;
    }

    if (secondItem.project_id === null) {
      return -1;
    }

    return firstItem.name.localeCompare(secondItem.name, "ru");
  });

  projectsTimeSummaryCache = {
    items: sortedItems.map((item) => ({
      ...item,
      percentage: nextTotalTime > 0 ? Math.round((item.total_time_seconds / nextTotalTime) * 10000) / 100 : 0,
    })),
    total_time_seconds: nextTotalTime,
  };
}

function createSummaryItem(projectId: number | null): ProjectTimeSummaryItem {
  const project = projectId == null ? null : getProjectListItem(projectId);

  return {
    project_id: projectId,
    name: project?.name ?? (projectId === null ? "Без проекта" : "Проект"),
    color: project?.color ?? "#8b949e",
    icon: project?.icon ?? (projectId === null ? "briefcase" : "folder"),
    tasks_count: 0,
    active_tasks_count: 0,
    total_time_seconds: 0,
    percentage: 0,
  };
}

function applyTaskContribution(task: Task, sign: 1 | -1): void {
  const projectId = getTaskProjectId(task);
  const activeDelta = isTaskActive(task) ? sign : 0;
  const tasksWithTimeDelta = task.total_time_seconds > 0 ? sign : 0;
  const totalTimeDelta = task.total_time_seconds * sign;

  if (projectId != null) {
    const project = getProjectListItem(projectId);
    if (project) {
      updateProjectListItem(projectId, (currentProject) => ({
        ...currentProject,
        tasks_count: Math.max(0, currentProject.tasks_count + sign),
        active_tasks_count: Math.max(0, currentProject.active_tasks_count + activeDelta),
        tasks_with_time_count: Math.max(0, currentProject.tasks_with_time_count + tasksWithTimeDelta),
        total_time_seconds: Math.max(0, currentProject.total_time_seconds + totalTimeDelta),
      }));
    }
  }

  const summaryItem = getSummaryItem(projectId);
  if (summaryItem || projectId === null) {
    updateSummaryItem(projectId, (currentItem) => ({
      ...currentItem,
      tasks_count: Math.max(0, currentItem.tasks_count + sign),
      active_tasks_count: Math.max(0, currentItem.active_tasks_count + activeDelta),
      total_time_seconds: Math.max(0, currentItem.total_time_seconds + totalTimeDelta),
    }));
  }
}

export function getCachedProjects(): ProjectListItem[] | null {
  return projectsListCache;
}

export function setCachedProjects(projects: ProjectListItem[] | null): void {
  projectsListCache = projects;
}

export function getCachedProjectsTimeSummary(): ProjectsTimeSummaryResponse | null {
  return projectsTimeSummaryCache;
}

export function setCachedProjectsTimeSummary(summary: ProjectsTimeSummaryResponse | null): void {
  projectsTimeSummaryCache = summary;
}

export function updateCachedProject(
  projectId: number,
  updater: (project: ProjectListItem) => ProjectListItem,
): void {
  updateProjectListItem(projectId, updater);
}

export function updateCachedProjectIdentity(project: {
  id: number;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  is_archived: boolean;
  updated_at: string;
}): void {
  updateProjectListItem(project.id, (currentProject) => ({
    ...currentProject,
    ...project,
  }));

  if (!getSummaryItem(project.id)) {
    return;
  }

  updateSummaryItem(project.id, (currentItem) => ({
    ...currentItem,
    name: project.name,
    color: project.color,
    icon: project.icon,
  }));
}

export function removeCachedProject(projectId: number): void {
  if (!projectsListCache) {
    return;
  }

  projectsListCache = projectsListCache.filter((project) => project.id !== projectId);
}

export function updateCachedUnassignedProject(
  updater: (project: ProjectTimeSummaryItem) => ProjectTimeSummaryItem,
): void {
  updateSummaryItem(null, updater);
}

export function invalidateProjectsListCache(): void {
  projectsListCache = null;
}

export function invalidateProjectsTimeSummaryCache(): void {
  projectsTimeSummaryCache = null;
}

export function resetProjectsCache(): void {
  projectsListCache = null;
  projectsTimeSummaryCache = null;
}

export function applyTaskProjectChangeToProjectsCache(change: ProjectTaskChange): void {
  if (change.previousTask) {
    applyTaskContribution(change.previousTask, -1);
  }

  if (change.nextTask) {
    applyTaskContribution(change.nextTask, 1);
  }
}
