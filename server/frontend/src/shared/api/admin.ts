import { ApiError, apiRequest } from "./client";
import type {
  AdminSystemStats,
  AdminUserActivity,
  AdminUserDetails,
  AdminUserListResponse,
  AdminUsersQuery,
  AdminUserUpdate,
} from "../types/admin";

export const adminAccessRevokedEvent = "time-tracking:admin-access-revoked";

export async function getAdminStats(): Promise<AdminSystemStats> {
  return adminRequest<AdminSystemStats>("/api/v1/admin/stats");
}

export async function getAdminUsers(
  query: AdminUsersQuery = {},
): Promise<AdminUserListResponse> {
  return adminRequest<AdminUserListResponse>(`/api/v1/admin/users?${buildAdminUsersQuery(query)}`);
}

export function buildAdminUsersQuery(query: AdminUsersQuery = {}): string {
  const params = new URLSearchParams();
  const search = query.search?.trim();
  if (search) params.set("search", search);
  if (query.role) params.set("role", query.role);
  if (query.isActive !== undefined) params.set("is_active", String(query.isActive));
  params.set("limit", String(query.limit ?? 20));
  params.set("offset", String(query.offset ?? 0));
  return params.toString();
}

export async function getAdminUser(userId: number): Promise<AdminUserDetails> {
  return adminRequest<AdminUserDetails>(`/api/v1/admin/users/${userId}`);
}

export async function updateAdminUser(
  userId: number,
  payload: AdminUserUpdate,
): Promise<AdminUserDetails> {
  return adminRequest<AdminUserDetails>(`/api/v1/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getAdminUserActivity(
  userId: number,
  year?: number,
): Promise<AdminUserActivity> {
  const suffix = year ? `?year=${year}` : "";
  return adminRequest<AdminUserActivity>(`/api/v1/admin/users/${userId}/activity${suffix}`);
}

async function adminRequest<T>(path: string, options?: RequestInit): Promise<T> {
  try {
    return await apiRequest<T>(path, options);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      window.dispatchEvent(new Event(adminAccessRevokedEvent));
    }
    throw error;
  }
}
