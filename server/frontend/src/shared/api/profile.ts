import { apiRequest, USE_MOCKS } from "./client";
import { mockUser, getMockActivity } from "./mockData";
import type { ActivityResponse } from "../types/reports";
import type { UpdateUserRequest, User } from "../types/user";

let userStore: User = { ...mockUser, stats: { ...mockUser.stats } };

export async function getCurrentUser(): Promise<User> {
  if (USE_MOCKS) {
    return userStore;
  }

  return apiRequest<User>("/api/v1/users/me");
}

export async function updateCurrentUser(payload: UpdateUserRequest): Promise<User> {
  if (USE_MOCKS) {
    userStore = {
      ...userStore,
      username: payload.username.trim(),
      full_name: payload.full_name?.trim() || null,
      avatar_letter: payload.username.trim().slice(0, 1).toUpperCase(),
    };

    return userStore;
  }

  return apiRequest<User>("/api/v1/users/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getUserActivity(year: number): Promise<ActivityResponse> {
  if (USE_MOCKS) {
    return getMockActivity(year);
  }

  return apiRequest<ActivityResponse>(`/api/v1/users/me/activity?year=${year}`);
}
