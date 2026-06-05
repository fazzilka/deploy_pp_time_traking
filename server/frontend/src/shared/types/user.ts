export type UserRole = "user" | "admin";

export type UserStats = {
  tasks_count: number;
  tasks_with_time_count: number;
  total_time_seconds: number;
  current_streak_days: number;
  max_streak_days: number;
};

export type User = {
  id: number;
  email: string;
  username: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  avatar_letter: string;
  created_at: string;
  stats: UserStats;
};

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
