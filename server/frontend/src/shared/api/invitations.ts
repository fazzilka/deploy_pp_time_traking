import type { InvitationResolve, WorkspaceInvitation, WorkspaceRole } from "../types/workspace";
import { apiRequest } from "./client";

const continuationKey = "time-tracking.invitation-token";

export function saveInvitationContinuation(token: string): void {
  sessionStorage.setItem(continuationKey, token);
}

export function getInvitationContinuation(): string | null {
  return sessionStorage.getItem(continuationKey);
}

export function clearInvitationContinuation(): void {
  sessionStorage.removeItem(continuationKey);
}

export async function resolveInvitation(token: string): Promise<InvitationResolve> {
  return apiRequest<InvitationResolve>("/api/v1/invitations/resolve", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function getMyInvitations(): Promise<WorkspaceInvitation[]> {
  return apiRequest<WorkspaceInvitation[]>("/api/v1/invitations");
}

export async function acceptInvitation(invitationId: string): Promise<WorkspaceInvitation> {
  return apiRequest<WorkspaceInvitation>(`/api/v1/invitations/${invitationId}/accept`, {
    method: "POST",
  });
}

export async function declineInvitation(invitationId: string): Promise<WorkspaceInvitation> {
  return apiRequest<WorkspaceInvitation>(`/api/v1/invitations/${invitationId}/decline`, {
    method: "POST",
  });
}

export async function createInvitation(
  workspaceId: number,
  payload: { email: string; role: WorkspaceRole },
): Promise<WorkspaceInvitation> {
  return apiRequest<WorkspaceInvitation>(`/api/v1/workspaces/${workspaceId}/invitations`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getWorkspaceInvitations(workspaceId: number): Promise<WorkspaceInvitation[]> {
  return apiRequest<WorkspaceInvitation[]>(`/api/v1/workspaces/${workspaceId}/invitations`);
}

export async function revokeInvitation(
  workspaceId: number,
  invitationId: string,
): Promise<WorkspaceInvitation> {
  return apiRequest<WorkspaceInvitation>(
    `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}`,
    { method: "DELETE" },
  );
}

export async function resendInvitation(
  workspaceId: number,
  invitationId: string,
): Promise<WorkspaceInvitation> {
  return apiRequest<WorkspaceInvitation>(
    `/api/v1/workspaces/${workspaceId}/invitations/${invitationId}/resend`,
    { method: "POST" },
  );
}
