export type TaskCommentAuthor = {
  id: number;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  avatar_letter?: string | null;
  avatar_seed?: string | null;
};

export type TaskComment = {
  id: number;
  task_id: number;
  workspace_id: number;
  author: TaskCommentAuthor;
  body: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at?: string | null;
  is_deleted: boolean;
  can_edit: boolean;
  can_delete: boolean;
};

export type TaskCommentsPage = {
  items: TaskComment[];
  total_active: number;
  limit: number;
  next_cursor: string | null;
};
