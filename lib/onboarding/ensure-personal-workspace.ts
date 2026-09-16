/**
 * Ensure the personal bootstrap workspace exists for a profile.
 * Used by onboarding finish and early bootstrap (so Apps can connect before complete).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkspaceKind } from "@/lib/types";

export const ONBOARDING_NAV_SPACES = [
  "work",
  "build",
  "research",
  "studio",
] as const;

export function personalWorkspaceIdForUser(userId: string): string {
  return `ws-${userId.replace(/-/g, "")}`;
}

export async function ensurePersonalWorkspace(input: {
  admin: SupabaseClient;
  userId: string;
  workspaceName?: string;
  kind?: WorkspaceKind;
}): Promise<{ workspaceId: string }> {
  const kind: WorkspaceKind = input.kind ?? "personal";
  const workspaceName =
    input.workspaceName?.trim() ||
    (kind === "personal" ? "Personal" : "Workspace");
  const navSpaces = [...ONBOARDING_NAV_SPACES];
  const wsId = personalWorkspaceIdForUser(input.userId);

  const { data: personalMembership } = await input.admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("profile_id", input.userId)
    .eq("workspace_id", wsId)
    .maybeSingle();

  if (!personalMembership) {
    const { error: createWsError } = await input.admin.from("workspaces").upsert({
      id: wsId,
      name: workspaceName,
      kind,
      personal: kind === "personal",
      spaces: navSpaces,
    });
    if (createWsError) {
      throw new Error(createWsError.message);
    }
    const { error: createMemError } = await input.admin
      .from("workspace_members")
      .upsert({
        workspace_id: wsId,
        profile_id: input.userId,
        role: "Owner",
        spaces: navSpaces,
      });
    if (createMemError) {
      throw new Error(createMemError.message);
    }
  } else {
    await input.admin
      .from("workspaces")
      .update({
        name: workspaceName,
        spaces: navSpaces,
        kind,
        personal: kind === "personal",
      })
      .eq("id", wsId);

    await input.admin
      .from("workspace_members")
      .update({ spaces: navSpaces })
      .eq("workspace_id", wsId)
      .eq("profile_id", input.userId);
  }

  return { workspaceId: wsId };
}
