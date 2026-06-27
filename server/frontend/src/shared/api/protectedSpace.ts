import { apiRequest, USE_MOCKS } from "./client";
import { clearReportsCache } from "./reports";
import { setVaultToken } from "./vaultToken";
import type {
  ProtectedSpaceRead,
  ProtectedSpaceStatus,
  ProtectedSpaceUnlockResponse,
} from "../types/protectedSpace";

let mockProtectedSpace: ProtectedSpaceRead | null = null;
let mockUnlockExpiresAt: string | null = null;

export function clearProtectedVaultToken(): void {
  setVaultToken(null);
  mockUnlockExpiresAt = null;
  clearReportsCache();
}

export async function getProtectedSpaceStatus(): Promise<ProtectedSpaceStatus> {
  if (USE_MOCKS) {
    return {
      exists: mockProtectedSpace !== null,
      workspace_id: mockProtectedSpace?.workspace_id ?? null,
      is_unlocked: mockUnlockExpiresAt !== null && new Date(mockUnlockExpiresAt).getTime() > Date.now(),
      expires_at: mockUnlockExpiresAt,
    };
  }

  return apiRequest<ProtectedSpaceStatus>("/api/v1/protected-space/status");
}

export async function createProtectedSpace(password: string): Promise<ProtectedSpaceRead> {
  if (USE_MOCKS) {
    if (mockProtectedSpace) {
      throw new Error("Защищённое пространство уже создано");
    }
    mockProtectedSpace = {
      workspace_id: 999,
      name: "Защищённое пространство 🔒",
      is_enabled: true,
      created_at: new Date().toISOString(),
    };
    return mockProtectedSpace;
  }

  return apiRequest<ProtectedSpaceRead>("/api/v1/protected-space", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function unlockProtectedSpace(password: string): Promise<ProtectedSpaceUnlockResponse> {
  if (USE_MOCKS) {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const response = {
      workspace_id: mockProtectedSpace?.workspace_id ?? 999,
      vault_token: `mock-vault-token-${Date.now()}`,
      expires_at: expiresAt,
    };
    setVaultToken(response.vault_token);
    mockUnlockExpiresAt = expiresAt;
    return response;
  }

  const response = await apiRequest<ProtectedSpaceUnlockResponse>("/api/v1/protected-space/unlock", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  setVaultToken(response.vault_token);
  return response;
}

export async function lockProtectedSpace(): Promise<void> {
  try {
    if (!USE_MOCKS) {
      await apiRequest<void>("/api/v1/protected-space/lock", { method: "POST" });
    }
  } finally {
    clearProtectedVaultToken();
  }
}

export async function changeProtectedSpacePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await apiRequest<{ detail: string }>("/api/v1/protected-space/change-password", {
    method: "POST",
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
  clearProtectedVaultToken();
}
