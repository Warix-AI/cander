/**
 * Server-side project access: member AND (creator OR shared workspace).
 * Shared = business kind OR member count >= 2.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  canAccessProjectState,
  isSharedWorkspaceState,
} from "@/lib/security/project-access-state";

export {
  canAccessProjectState,
  isSharedWorkspaceState,
} from "@/lib/security/project-access-state";

export async function isSharedWorkspace(workspaceId: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data: workspace } = await admin
    .from("workspaces")
    .select("kind")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!workspace) return false;
  const { count } = await admin
    .from("workspace_members")
    .select("profile_id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  return isSharedWorkspaceState({
    kind: workspace.kind as string | null,
    memberCount: count ?? 0,
  });
}

export async function assertWorkspaceMember(
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("profile_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export type ProjectAccessRow = {
  id: string;
  workspaceId: string;
  createdBy: string | null;
  kind: string | null;
};

/**
 * Member of workspace and (project creator OR shared workspace).
 * Null created_by is inaccessible to non-creators in personal solo workspaces
 * unless the workspace is shared.
 */
export async function assertProjectAccess(opts: {
  projectId: string;
  workspaceId: string;
  userId: string;
}): Promise<{ ok: true; project: ProjectAccessRow } | { ok: false }> {
  const admin = createSupabaseAdminClient();
  const member = await assertWorkspaceMember(opts.workspaceId, opts.userId);
  if (!member) return { ok: false };

  const { data } = await admin
    .from("projects")
    .select("id, workspace_id, created_by, kind")
    .eq("id", opts.projectId)
    .eq("workspace_id", opts.workspaceId)
    .maybeSingle();
  if (!data) return { ok: false };

  const createdBy =
    typeof data.created_by === "string" ? data.created_by : null;
  const shared = await isSharedWorkspace(opts.workspaceId);
  if (
    !canAccessProjectState({
      actorId: opts.userId,
      createdBy,
      isMember: true,
      shared,
    })
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    project: {
      id: String(data.id),
      workspaceId: String(data.workspace_id),
      createdBy,
      kind: (data.kind as string | null) ?? null,
    },
  };
}

/** Membership-only project existence check (legacy callers). Prefer assertProjectAccess. */
export async function assertProjectInWorkspace(
  projectId: string,
  workspaceId: string,
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return Boolean(data);
}
