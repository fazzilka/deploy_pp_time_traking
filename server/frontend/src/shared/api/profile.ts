import { apiRequest, USE_MOCKS } from "./client";
import { mockUser, getMockActivity } from "./mockData";
import type { ActivityResponse } from "../types/reports";
import type { ChangePasswordRequest, ChangePasswordResponse, UpdateUserRequest, User } from "../types/user";

let userStore: User = { ...mockUser, stats: { ...mockUser.stats } };
let currentUserRequest: Promise<User> | null = null;
const pendingActivityRequests = new Map<number, Promise<ActivityResponse>>();

export async function getCurrentUser(): Promise<User> {
  if (USE_MOCKS) {
    return userStore;
  }

  if (!currentUserRequest) {
    currentUserRequest = apiRequest<User>("/api/v1/users/me").finally(() => {
      currentUserRequest = null;
    });
  }

  return currentUserRequest;
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

  currentUserRequest = null;
  return apiRequest<User>("/api/v1/users/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
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

export async function getUserActivity(year: number): Promise<ActivityResponse> {
  if (USE_MOCKS) {
    return getMockActivity(year);
  }

  const pendingRequest = pendingActivityRequests.get(year);

  if (pendingRequest) {
    return pendingRequest;
  }

  const request = apiRequest<ActivityResponse>(`/api/v1/users/me/activity?year=${year}`).finally(() => {
    pendingActivityRequests.delete(year);
  });
  pendingActivityRequests.set(year, request);
  return request;
}
