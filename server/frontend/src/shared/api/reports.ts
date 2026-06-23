import { apiRequest, USE_MOCKS } from "./client";
import { getProjectsTimeSummary } from "./projects";
import { getTasks } from "./tasks";
import { getUserActivity } from "./profile";
import { onTaskDataChanged } from "./cacheEvents";
import type { ActivityResponse, ProjectsTimeSummaryResponse, SummaryResponse } from "../types/reports";

const pendingSummaryRequests = new Map<string, Promise<SummaryResponse>>();
const summaryCache = new Map<
  string,
  {
    value: SummaryResponse | null;
    loaded: boolean;
    dirty: boolean;
    version: number;
  }
>();

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

export function invalidateReportsCache(): void {
  summaryCache.forEach((cachedSummary) => {
    cachedSummary.version += 1;
    cachedSummary.dirty = true;
  });
  pendingSummaryRequests.clear();
}

export function clearReportsCache(): void {
  summaryCache.clear();
  pendingSummaryRequests.clear();
}

onTaskDataChanged(invalidateReportsCache);
