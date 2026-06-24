import { apiRequest, USE_MOCKS } from "./client";
import { getProjectsTimeSummary } from "./projects";
import { getTasks } from "./tasks";
import { getUserActivity } from "./profile";
import { onTaskDataChanged } from "./cacheEvents";
import type { ActivityResponse, ProjectsTimeSummaryResponse, SummaryResponse } from "../types/reports";
import type { UserEventPayload } from "../events/userEvents";

const pendingSummaryRequests = new Map<string, Promise<SummaryResponse>>();
const REPORTS_REFRESH_DEBOUNCE_MS = 400;
const currentYear = new Date().getFullYear();
const REPORT_RELEVANT_EVENTS = new Set([
  "task_created",
  "task_updated",
  "task_deleted",
  "task_status_changed",
  "task_assignee_changed",
  "project_created",
  "project_updated",
  "project_deleted",
  "timer_started",
  "timer_stopped",
  "time_interval_created",
  "time_interval_updated",
  "time_interval_deleted",
  "workspace_member_added",
  "workspace_member_removed",
  "workspace_member_role_changed",
  "workspace_member_left",
  "workspace_changed",
]);

export type ReportsData = {
  summary: SummaryResponse;
  activity: ActivityResponse;
  projectsSummary: ProjectsTimeSummaryResponse;
};

export type ReportsCacheSnapshot = {
  data: ReportsData | null;
  isLoading: boolean;
  error: string | null;
  lastUpdatedAt: number;
  loaded: boolean;
};

const summaryCache = new Map<
  string,
  {
    value: SummaryResponse | null;
    loaded: boolean;
    dirty: boolean;
    version: number;
  }
>();
const reportsCache = new Map<
  number,
  ReportsCacheSnapshot & {
    pending: Promise<ReportsData> | null;
    version: number;
  }
>();
const reportsListeners = new Set<() => void>();
const reportsRefreshTimers = new Map<number, number>();
const emptyReportsSnapshot: ReportsCacheSnapshot = {
  data: null,
  isLoading: false,
  error: null,
  lastUpdatedAt: 0,
  loaded: false,
};

type CacheOptions = {
  force?: boolean;
};

function getSummaryCacheState(path: string) {
  const cachedSummary = summaryCache.get(path);

  if (cachedSummary) {
    return cachedSummary;
  }

  const nextCache = {
    value: null,
    loaded: false,
    dirty: false,
    version: 0,
  };
  summaryCache.set(path, nextCache);
  return nextCache;
}

function createReportsCacheState() {
  return {
    data: null,
    isLoading: false,
    error: null,
    lastUpdatedAt: 0,
    loaded: false,
    pending: null,
    version: 0,
  };
}

function getReportsCacheState(workspaceId: number) {
  const cachedReports = reportsCache.get(workspaceId);

  if (cachedReports) {
    return cachedReports;
  }

  const nextCache = createReportsCacheState();
  reportsCache.set(workspaceId, nextCache);
  return nextCache;
}

function emitReportsChange() {
  reportsListeners.forEach((listener) => listener());
}

function eventWorkspaceId(payload: UserEventPayload): number | null {
  const workspaceId = "workspace_id" in payload ? payload.workspace_id : null;
  return typeof workspaceId === "number" ? workspaceId : null;
}

function isReportRelevantEvent(event: string, payload: UserEventPayload, workspaceId: number): boolean {
  if (!REPORT_RELEVANT_EVENTS.has(event)) {
    return false;
  }

  const eventWorkspace = eventWorkspaceId(payload);
  return eventWorkspace === null || eventWorkspace === workspaceId;
}

export function subscribeToReportsCache(listener: () => void): () => void {
  reportsListeners.add(listener);
  return () => reportsListeners.delete(listener);
}

export function getReportsSnapshot(workspaceId: number | null): ReportsCacheSnapshot {
  if (workspaceId === null) {
    return emptyReportsSnapshot;
  }

  return getReportsCacheState(workspaceId);
}

export async function getSummary(
  limit?: number,
  options: CacheOptions & { workspaceId?: number } = {},
): Promise<SummaryResponse> {
  const params = new URLSearchParams();
  if (limit) {
    params.set("limit", String(limit));
  }
  if (options.workspaceId !== undefined) {
    params.set("workspace_id", String(options.workspaceId));
  }
  const query = params.toString();
  const path = `/api/v1/summary${query ? `?${query}` : ""}`;

  if (USE_MOCKS) {
    const tasks = await getTasks({ workspaceId: options.workspaceId });
    const topTasksLimit = limit ?? 5;

    return {
      total_time_seconds_all_tasks: tasks.reduce((sum, task) => sum + task.total_time_seconds, 0),
      tasks_with_time_count: tasks.filter((task) => task.total_time_seconds > 0).length,
      top_tasks: tasks
        .filter((task) => task.total_time_seconds > 0)
        .sort((a, b) => b.total_time_seconds - a.total_time_seconds)
        .slice(0, topTasksLimit)
        .map((task) => ({
          id: task.id,
          title: task.title,
          description: task.description,
          total_time_seconds: task.total_time_seconds,
          deadline: task.deadline,
          priority: task.priority,
        })),
    };
  }

  const cachedSummary = getSummaryCacheState(path);
  if (!options.force && cachedSummary.loaded && !cachedSummary.dirty && cachedSummary.value) {
    return cachedSummary.value;
  }

  const pendingRequest = pendingSummaryRequests.get(path);

  if (!options.force && pendingRequest) {
    return pendingRequest;
  }

  const requestVersion = cachedSummary.version;
  const request = apiRequest<SummaryResponse>(path)
    .then((summary) => {
      cachedSummary.value = summary;
      cachedSummary.loaded = true;
      if (cachedSummary.version === requestVersion) {
        cachedSummary.dirty = false;
      }
      return summary;
    })
    .finally(() => {
      pendingSummaryRequests.delete(path);
    });
  pendingSummaryRequests.set(path, request);
  return request;
}

export async function getReportsData(year: number, options: CacheOptions & { workspaceId?: number } = {}): Promise<{
  summary: SummaryResponse;
  activity: ActivityResponse;
  projectsSummary: ProjectsTimeSummaryResponse;
}> {
  const [summary, activity, projectsSummary] = await Promise.all([
    getSummary(3, options),
    getUserActivity(year, options),
    getProjectsTimeSummary(options.workspaceId, { force: options.force }),
  ]);

  return {
    summary,
    activity,
    projectsSummary,
  };
}

export async function ensureReportsLoaded(workspaceId: number, options: CacheOptions = {}): Promise<ReportsData> {
  const cachedReports = getReportsCacheState(workspaceId);

  if (!options.force && cachedReports.loaded && !cachedReports.error && cachedReports.data) {
    return cachedReports.data;
  }

  if (!options.force && cachedReports.pending) {
    return cachedReports.pending;
  }

  cachedReports.isLoading = !cachedReports.loaded;
  cachedReports.error = null;
  const requestVersion = cachedReports.version;
  emitReportsChange();

  cachedReports.pending = getReportsData(currentYear, { workspaceId, force: options.force })
    .then((reports) => {
      cachedReports.data = reports;
      cachedReports.loaded = true;
      cachedReports.lastUpdatedAt = Date.now();
      if (cachedReports.version === requestVersion) {
        cachedReports.error = null;
      }
      return reports;
    })
    .catch((error: unknown) => {
      cachedReports.error = "Не удалось загрузить отчёты";
      throw error;
    })
    .finally(() => {
      cachedReports.isLoading = false;
      cachedReports.pending = null;
      emitReportsChange();
    });

  return cachedReports.pending;
}

export function refreshReportsForWorkspace(workspaceId: number): Promise<ReportsData> {
  const cachedReports = getReportsCacheState(workspaceId);
  cachedReports.version += 1;
  cachedReports.pending = null;
  return ensureReportsLoaded(workspaceId, { force: true });
}

export function scheduleReportsRefreshForWorkspace(workspaceId: number): void {
  const currentTimer = reportsRefreshTimers.get(workspaceId);
  if (currentTimer !== undefined) {
    window.clearTimeout(currentTimer);
  }

  const nextTimer = window.setTimeout(() => {
    reportsRefreshTimers.delete(workspaceId);
    void refreshReportsForWorkspace(workspaceId).catch(() => undefined);
  }, REPORTS_REFRESH_DEBOUNCE_MS);
  reportsRefreshTimers.set(workspaceId, nextTimer);
}

export function cancelScheduledReportsRefresh(workspaceId?: number): void {
  if (workspaceId !== undefined) {
    const timer = reportsRefreshTimers.get(workspaceId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      reportsRefreshTimers.delete(workspaceId);
    }
    return;
  }

  reportsRefreshTimers.forEach((timer) => window.clearTimeout(timer));
  reportsRefreshTimers.clear();
}

export function handleReportsEvent(event: string, payload: UserEventPayload, currentWorkspaceId: number | null): void {
  if (currentWorkspaceId === null || !isReportRelevantEvent(event, payload, currentWorkspaceId)) {
    return;
  }

  scheduleReportsRefreshForWorkspace(currentWorkspaceId);
}

export function invalidateReportsCache(): void {
  summaryCache.forEach((cachedSummary) => {
    cachedSummary.version += 1;
    cachedSummary.dirty = true;
  });
  pendingSummaryRequests.clear();
  reportsCache.forEach((cachedReports) => {
    cachedReports.version += 1;
  });
}

export function clearReportsCache(): void {
  summaryCache.clear();
  pendingSummaryRequests.clear();
  cancelScheduledReportsRefresh();
  reportsCache.clear();
  emitReportsChange();
}

onTaskDataChanged(invalidateReportsCache);
