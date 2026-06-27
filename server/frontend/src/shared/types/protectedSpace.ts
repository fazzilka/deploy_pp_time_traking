export type ProtectedSpaceStatus = {
  exists: boolean;
  workspace_id: number | null;
  is_unlocked: boolean;
  expires_at: string | null;
};

export type ProtectedSpaceRead = {
  workspace_id: number;
  name: string;
  is_enabled: boolean;
  created_at: string;
};

export type ProtectedSpaceUnlockResponse = {
  workspace_id: number;
  vault_token: string;
  expires_at: string;
};
