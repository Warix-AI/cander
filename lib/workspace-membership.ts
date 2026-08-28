import { memberName } from "@/lib/entitlements";
import { getMembersSnapshot } from "@/lib/workspace-policy";
import type { Role } from "@/lib/types";

export type WorkspaceInviteStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "revoked";

export type WorkspaceInvite = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  inviteeProfileId: string | null;
  inviteeEmail: string;
  invitedBy: string;
  inviterName: string;
  orgId: string | null;
  status: WorkspaceInviteStatus;
  expiresAt: string;
  createdAt: string;
};

export type WorkspaceInviteRow = {
  id: string;
  workspace_id: string;
  invitee_profile_id: string | null;
  invitee_email: string;
  invited_by: string;
  org_id: string | null;
  status: WorkspaceInviteStatus;
  expires_at: string;
  created_at: string;
  updated_at: string;
  workspaces?: { name: string } | { name: string }[] | null;
  inviter?: { name: string } | { name: string }[] | null;
};

export function inviteRowToInvite(row: WorkspaceInviteRow): WorkspaceInvite {
  const workspaceName = Array.isArray(row.workspaces)
    ? row.workspaces[0]?.name
    : row.workspaces?.name;
  const inviterName = Array.isArray(row.inviter)
    ? row.inviter[0]?.name
    : row.inviter?.name;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: workspaceName ?? row.workspace_id,
    inviteeProfileId: row.invitee_profile_id,
    inviteeEmail: row.invitee_email,
    invitedBy: row.invited_by,
    inviterName: inviterName ?? "Someone",
    orgId: row.org_id,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export function canManageWorkspace(
  roles: Record<string, Role> | undefined,
  workspaceId: string,
) {
  return canEditWorkspaceSettings(roles, workspaceId);
}

export function canEditWorkspaceSettings(
  roles: Record<string, Role> | undefined,
  workspaceId: string,
) {
  const role = roles?.[workspaceId];
  return role === "Owner" || role === "Admin";
}

export function isWorkspaceGuest(
  roles: Record<string, Role> | undefined,
  workspaceId: string,
) {
  const role = roles?.[workspaceId];
  return role === "Member";
}

export function creatorLabel(
  profileId: string | null | undefined,
  actorId?: string,
): string | null {
  if (!profileId) return null;
  if (actorId && profileId === actorId) return "You";
  return memberName(profileId, getMembersSnapshot()) || null;
}

export function sharedWorkspaceAttribution(
  memberCount: number,
  workspaceKind: "personal" | "business" | undefined,
): boolean {
  if (memberCount <= 1) return false;
  return workspaceKind === "business";
}
