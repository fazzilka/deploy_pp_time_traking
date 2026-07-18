import type { ActivityResponse } from "./reports";
import type { UserProfile, UserRole, UserStats } from "./user";

export type AdminUserStats = Pick<UserStats, "tasks_count" | "total_time_seconds">;

export type AdminUserListItem = Omit<UserProfile, "stats"> & {
  stats: AdminUserStats;
};

export type AdminUserDetails = Omit<UserProfile, "stats"> & {
  email_verified: boolean;
  stats: UserStats;
};

export type AdminUserListResponse = {
  items: AdminUserListItem[];
  total: number;
};

export type AdminTopUser = {
  id: number;
  username: string;
  full_name: string | null;
  avatar_letter: string;
  avatar_seed?: string | null;
  total_time_seconds: number;
};

export type AdminSystemStats = {
  users_count: number;
  active_users_count: number;
  admins_count: number;
  tasks_count: number;
  total_time_seconds: number;
  top_users: AdminTopUser[];
};

export type AdminUsersQuery = {
  search?: string;
  role?: UserRole;
  isActive?: boolean;
  limit?: number;
  offset?: number;
};

export type AdminUserUpdate = Partial<
  Pick<AdminUserDetails, "username" | "full_name" | "role" | "is_active">
>;

export type AdminUserActivity = ActivityResponse;
