export type UserRole = "user" | "admin";

export type UserStats = {
  tasks_count: number;
  tasks_with_time_count: number;
  total_time_seconds: number;
  current_streak_days: number;
  max_streak_days: number;
};

export const EMPTY_USER_STATS: UserStats = {
  tasks_count: 0,
  tasks_with_time_count: 0,
  total_time_seconds: 0,
  current_streak_days: 0,
  max_streak_days: 0,
};

export type UserPublic = {
  id: number;
  email: string;
  username: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  avatar_letter: string;
  avatar_seed?: string | null;
};

export type UserProfile = UserPublic & {
  created_at: string;
  stats?: UserStats;
};

export type User = UserProfile;

export type UpdateUserRequest = {
  username: string;
  full_name: string | null;
};

export type ChangePasswordRequest = {
  old_password: string;
  new_password: string;
  confirm_password: string;
};

export type ChangePasswordResponse = {
  message: string;
};

export type NotificationPreferences = {
  locale: "ru" | "en";
  email_enabled: boolean;
  deadline_24h: boolean;
  deadline_1h: boolean;
  deadline_overdue: boolean;
  email_suppressed: boolean;
};

export type NotificationPreferencesUpdate = Partial<
  Omit<NotificationPreferences, "email_suppressed">
>;
