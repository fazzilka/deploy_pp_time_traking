import { apiRequest, USE_MOCKS } from "./client";
import { mockUser, getMockActivity } from "./mockData";
import type { ActivityResponse } from "../types/reports";
import type {
  ChangePasswordRequest,
  ChangePasswordResponse,
  NotificationPreferences,
  NotificationPreferencesUpdate,
  UpdateUserRequest,
  User,
  UserProfile,
  UserStats,
} from "../types/user";
import { EMPTY_USER_STATS } from "../types/user";

let userStore: User = { ...mockUser, stats: { ...(mockUser.stats ?? EMPTY_USER_STATS) } };
let notificationPreferencesStore: NotificationPreferences = {
  locale: "ru",
  email_enabled: true,
  deadline_24h: true,
  deadline_1h: true,
  deadline_overdue: true,
  email_suppressed: false,
};
export const userProfileUpdatedEvent = "time-tracking:user-profile-updated";

type CacheState<T> = {
  data: T | null;
  loaded: boolean;
  dirty: boolean;
  pending: Promise<T> | null;
  version: number;
};

type CacheOptions = {
  force?: boolean;
};

function createCacheState<T>(): CacheState<T> {
  return {
    data: null,
    loaded: false,
    dirty: false,
    pending: null,
    version: 0,
  };
}

const profileCache = createCacheState<UserProfile>();
const profileStatsCache = createCacheState<UserStats>();
const activityCaches = new Map<number, CacheState<ActivityResponse>>();

function toUserProfile(user: User): UserProfile {
  const { stats: _stats, ...profile } = user;
  return profile;
}

function notifyProfileUpdated(profile: UserProfile): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<UserProfile>(userProfileUpdatedEvent, {
      detail: profile,
    }),
  );
}

function getActivityCache(year: number): CacheState<ActivityResponse> {
  const cachedActivity = activityCaches.get(year);

  if (cachedActivity) {
    return cachedActivity;
  }

  const nextCache = createCacheState<ActivityResponse>();
  activityCaches.set(year, nextCache);
  return nextCache;
}

export async function getCurrentUser(options: CacheOptions = {}): Promise<UserProfile> {
  if (USE_MOCKS) {
    return toUserProfile(userStore);
  }

  if (!options.force && profileCache.loaded && !profileCache.dirty && profileCache.data) {
    return profileCache.data;
  }

  if (!options.force && profileCache.pending) {
    return profileCache.pending;
  }

  const requestVersion = profileCache.version;
  profileCache.pending = apiRequest<UserProfile>("/api/v1/users/me")
    .then((profile) => {
      profileCache.data = profile;
      profileCache.loaded = true;
      if (profileCache.version === requestVersion) {
        profileCache.dirty = false;
      }
      return profile;
    })
    .finally(() => {
      profileCache.pending = null;
    });

  return profileCache.pending;
}

export async function getProfileStats(options: CacheOptions = {}): Promise<UserStats> {
  if (USE_MOCKS) {
    return { ...(userStore.stats ?? EMPTY_USER_STATS) };
  }

  if (!options.force && profileStatsCache.loaded && !profileStatsCache.dirty && profileStatsCache.data) {
    return profileStatsCache.data;
  }

  if (!options.force && profileStatsCache.pending) {
    return profileStatsCache.pending;
  }

  const requestVersion = profileStatsCache.version;
  profileStatsCache.pending = apiRequest<UserStats>("/api/v1/users/me/stats")
    .then((stats) => {
      profileStatsCache.data = stats;
      profileStatsCache.loaded = true;
      if (profileStatsCache.version === requestVersion) {
        profileStatsCache.dirty = false;
      }
      return stats;
    })
    .finally(() => {
      profileStatsCache.pending = null;
    });

  return profileStatsCache.pending;
}

export async function updateCurrentUser(payload: UpdateUserRequest): Promise<UserProfile> {
  if (USE_MOCKS) {
    userStore = {
      ...userStore,
      username: payload.username.trim(),
      full_name: payload.full_name?.trim() || null,
      avatar_letter: payload.username.trim().slice(0, 1).toUpperCase(),
    };

    const updatedProfile = toUserProfile(userStore);
    profileCache.data = updatedProfile;
    profileCache.loaded = true;
    profileCache.dirty = false;
    profileCache.version += 1;
    profileCache.pending = null;
    notifyProfileUpdated(updatedProfile);
    return updatedProfile;
  }

  profileCache.pending = null;
  const updatedProfile = await apiRequest<UserProfile>("/api/v1/users/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  profileCache.data = updatedProfile;
  profileCache.loaded = true;
  profileCache.dirty = false;
  profileCache.version += 1;
  notifyProfileUpdated(updatedProfile);
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

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  if (USE_MOCKS) {
    return { ...notificationPreferencesStore };
  }
  return apiRequest<NotificationPreferences>("/api/v1/users/me/notification-preferences");
}

export async function updateNotificationPreferences(
  payload: NotificationPreferencesUpdate,
): Promise<NotificationPreferences> {
  if (USE_MOCKS) {
    notificationPreferencesStore = {
      ...notificationPreferencesStore,
      ...payload,
      email_suppressed:
        payload.email_enabled === true ? false : notificationPreferencesStore.email_suppressed,
    };
    return { ...notificationPreferencesStore };
  }
  return apiRequest<NotificationPreferences>("/api/v1/users/me/notification-preferences", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function regenerateMyAvatar(): Promise<UserProfile> {
  if (USE_MOCKS) {
    userStore = {
      ...userStore,
      avatar_seed: `mock-avatar-${Date.now()}-${profileCache.version + 1}`,
    };

    const updatedProfile = toUserProfile(userStore);
    profileCache.data = updatedProfile;
    profileCache.loaded = true;
    profileCache.dirty = false;
    profileCache.version += 1;
    profileCache.pending = null;
    notifyProfileUpdated(updatedProfile);
    return updatedProfile;
  }

  profileCache.pending = null;
  const updatedProfile = await apiRequest<UserProfile>("/api/v1/users/me/avatar/regenerate", {
    method: "POST",
  });
  profileCache.data = updatedProfile;
  profileCache.loaded = true;
  profileCache.dirty = false;
  profileCache.version += 1;
  notifyProfileUpdated(updatedProfile);
  return updatedProfile;
}

export async function getUserActivity(year: number, options: CacheOptions = {}): Promise<ActivityResponse> {
  if (USE_MOCKS) {
    return getMockActivity(year);
  }

  const activityCache = getActivityCache(year);
  if (!options.force && activityCache.loaded && !activityCache.dirty && activityCache.data) {
    return activityCache.data;
  }

  if (!options.force && activityCache.pending) {
    return activityCache.pending;
  }

  const requestVersion = activityCache.version;
  activityCache.pending = apiRequest<ActivityResponse>(`/api/v1/users/me/activity?year=${year}`)
    .then((activity) => {
      activityCache.data = activity;
      activityCache.loaded = true;
      if (activityCache.version === requestVersion) {
        activityCache.dirty = false;
      }
      return activity;
    })
    .finally(() => {
      activityCache.pending = null;
    });
  return activityCache.pending;
}

export function invalidateProfile(): void {
  profileCache.version += 1;
  profileCache.dirty = true;
  profileCache.pending = null;
}

export function invalidateUserStats(): void {
  profileStatsCache.version += 1;
  profileStatsCache.dirty = true;
  profileStatsCache.pending = null;
}

export function invalidateUserActivity(year?: number): void {
  if (year === undefined) {
    activityCaches.forEach((activityCache) => {
      activityCache.version += 1;
      activityCache.dirty = true;
      activityCache.pending = null;
    });
    return;
  }

  const activityCache = getActivityCache(year);
  activityCache.version += 1;
  activityCache.dirty = true;
  activityCache.pending = null;
}

export function invalidateUserDerivedData(): void {
  invalidateUserStats();
  invalidateUserActivity();
}

export function resetUserCache(): void {
  profileCache.data = null;
  profileCache.loaded = false;
  profileCache.dirty = false;
  profileCache.pending = null;
  profileCache.version += 1;

  profileStatsCache.data = null;
  profileStatsCache.loaded = false;
  profileStatsCache.dirty = false;
  profileStatsCache.pending = null;
  profileStatsCache.version += 1;

  activityCaches.clear();
}

export function invalidateProfileCache(): void {
  invalidateProfile();
}

export function invalidateProfileStatsCache(): void {
  invalidateUserStats();
}

export function invalidateActivityCache(year?: number): void {
  invalidateUserActivity(year);
}

export function clearUserCaches(): void {
  resetUserCache();
}

export function hydrateUserCachesFromAuth(user: User): void {
  profileCache.data = toUserProfile(user);
  profileCache.loaded = true;
  profileCache.dirty = false;
  profileCache.pending = null;
  profileCache.version += 1;

  profileStatsCache.data = null;
  profileStatsCache.loaded = false;
  profileStatsCache.dirty = false;
  profileStatsCache.pending = null;
  profileStatsCache.version += 1;
  activityCaches.clear();

  if (user.stats) {
    profileStatsCache.data = { ...user.stats };
    profileStatsCache.loaded = true;
  }
}
