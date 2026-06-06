import { apiRequest, USE_MOCKS } from "./client";
import { mockUser, getMockActivity } from "./mockData";
import type { ActivityResponse } from "../types/reports";
import type {
  ChangePasswordRequest,
  ChangePasswordResponse,
  UpdateUserRequest,
  User,
  UserProfile,
  UserStats,
} from "../types/user";

let userStore: User = { ...mockUser, stats: { ...mockUser.stats } };
let profileCache: UserProfile | null = null;
let profileCacheTime = 0;
let currentUserRequest: Promise<UserProfile> | null = null;
let profileStatsCache: UserStats | null = null;
let profileStatsCacheTime = 0;
let profileStatsRequest: Promise<UserStats> | null = null;
const pendingActivityRequests = new Map<number, Promise<ActivityResponse>>();
const activityCache = new Map<number, { value: ActivityResponse; time: number }>();

const PROFILE_TTL_MS = 60_000;
const PROFILE_STATS_TTL_MS = 15_000;
const ACTIVITY_TTL_MS = 60_000;

type CacheOptions = {
  force?: boolean;
};

function isFresh(cacheTime: number, ttlMs: number): boolean {
  return Date.now() - cacheTime < ttlMs;
}

function toUserProfile(user: User): UserProfile {
  const { stats: _stats, ...profile } = user;
  return profile;
}

export async function getCurrentUser(options: CacheOptions = {}): Promise<UserProfile> {
  if (USE_MOCKS) {
    return toUserProfile(userStore);
  }

  if (!options.force && profileCache && isFresh(profileCacheTime, PROFILE_TTL_MS)) {
    return profileCache;
  }

  if (!options.force && currentUserRequest) {
    return currentUserRequest;
  }

  currentUserRequest = apiRequest<UserProfile>("/api/v1/users/me")
    .then((profile) => {
      profileCache = profile;
      profileCacheTime = Date.now();
      return profile;
    })
    .finally(() => {
      currentUserRequest = null;
    });

  return currentUserRequest;
}

export async function getProfileStats(options: CacheOptions = {}): Promise<UserStats> {
  if (USE_MOCKS) {
    return { ...userStore.stats };
  }

  if (!options.force && profileStatsCache && isFresh(profileStatsCacheTime, PROFILE_STATS_TTL_MS)) {
    return profileStatsCache;
  }

  if (!options.force && profileStatsRequest) {
    return profileStatsRequest;
  }

  profileStatsRequest = apiRequest<UserStats>("/api/v1/users/me/stats")
    .then((stats) => {
      profileStatsCache = stats;
      profileStatsCacheTime = Date.now();
      return stats;
    })
    .finally(() => {
      profileStatsRequest = null;
    });

  return profileStatsRequest;
}

export async function updateCurrentUser(payload: UpdateUserRequest): Promise<UserProfile> {
  if (USE_MOCKS) {
    userStore = {
      ...userStore,
      username: payload.username.trim(),
      full_name: payload.full_name?.trim() || null,
      avatar_letter: payload.username.trim().slice(0, 1).toUpperCase(),
    };

    return toUserProfile(userStore);
  }

  currentUserRequest = null;
  const updatedProfile = await apiRequest<UserProfile>("/api/v1/users/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  profileCache = updatedProfile;
  profileCacheTime = Date.now();
  return updatedProfile;
}

export async function changePassword(payload: ChangePasswordRequest): Promise<ChangePasswordResponse> {
  if (USE_MOCKS) {
    if (payload.old_password !== "password123") {
      throw new Error("Старый пароль указан неверно");
    }

    return { message: "Пароль успешно изменён" };
  }

  return apiRequest<ChangePasswordResponse>("/api/v1/users/me/change-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getUserActivity(year: number, options: CacheOptions = {}): Promise<ActivityResponse> {
  if (USE_MOCKS) {
    return getMockActivity(year);
  }

  const cachedActivity = activityCache.get(year);
  if (!options.force && cachedActivity && isFresh(cachedActivity.time, ACTIVITY_TTL_MS)) {
    return cachedActivity.value;
  }

  const pendingRequest = pendingActivityRequests.get(year);

  if (!options.force && pendingRequest) {
    return pendingRequest;
  }

  const request = apiRequest<ActivityResponse>(`/api/v1/users/me/activity?year=${year}`)
    .then((activity) => {
      activityCache.set(year, { value: activity, time: Date.now() });
      return activity;
    })
    .finally(() => {
      pendingActivityRequests.delete(year);
    });
  pendingActivityRequests.set(year, request);
  return request;
}

export function invalidateProfileCache(): void {
  profileCache = null;
  profileCacheTime = 0;
  currentUserRequest = null;
}

export function invalidateProfileStatsCache(): void {
  profileStatsCache = null;
  profileStatsCacheTime = 0;
  profileStatsRequest = null;
}

export function invalidateActivityCache(year?: number): void {
  if (year === undefined) {
    activityCache.clear();
    pendingActivityRequests.clear();
    return;
  }

  activityCache.delete(year);
  pendingActivityRequests.delete(year);
}

export function clearUserCaches(): void {
  invalidateProfileCache();
  invalidateProfileStatsCache();
  invalidateActivityCache();
}

export function hydrateUserCachesFromAuth(user: User): void {
  profileCache = toUserProfile(user);
  profileCacheTime = Date.now();
  profileStatsCache = { ...user.stats };
  profileStatsCacheTime = Date.now();
}
