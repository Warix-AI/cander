"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { NAV_SPACES } from "@/lib/spaces";
import type { Workspace, WorkspaceKind } from "@/lib/types";
import {
  getWorkspaceCatalogSnapshot,
  renameWorkspace,
  upsertCatalogWorkspace,
  uniqueWorkspaceId,
} from "@/lib/workspace-catalog";

/** Create a workspace in Supabase (when configured) and mirror into the local catalog. */
export async function createWorkspaceRemote(input: {
  name: string;
  kind: WorkspaceKind;
  userId: string;
}): Promise<Workspace> {
  const name = input.name.trim();
  if (!name) throw new Error("Give the workspace a name.");

  const id = uniqueWorkspaceId(name, getWorkspaceCatalogSnapshot());
  const spaces = [...NAV_SPACES];
  const personal = input.kind === "personal";

  if (isSupabaseConfigured()) {
    const supabase = createSupabaseBrowserClient();
    const { error: wsError } = await supabase.from("workspaces").insert({
      id,
      name,
      kind: input.kind,
      personal,
      spaces,
    });
    if (wsError) throw wsError;

    const { error: memError } = await supabase.from("workspace_members").insert({
      workspace_id: id,
      profile_id: input.userId,
      role: "Owner",
      spaces,
    });
    if (memError) {
      await supabase.from("workspaces").delete().eq("id", id);
      throw memError;
    }
  }

  return upsertCatalogWorkspace({
    id,
    name,
    spaces,
    members: 1,
    budget: "$0",
    spend: "$0",
    kind: input.kind,
    ...(personal ? { personal: true } : {}),
  });
}

/** Rename a workspace in Supabase (when configured) and the local catalog. */
export async function renameWorkspaceRemote(
  id: string,
  name: string,
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Give the workspace a name.");

  if (isSupabaseConfigured()) {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from("workspaces")
      .update({ name: trimmed })
      .eq("id", id);
    if (error) throw error;
  }

  if (!renameWorkspace(id, trimmed)) {
    throw new Error("Could not rename workspace.");
  }
}

/** Delete a workspace in Supabase (when configured). Local catalog purge is separate. */
export async function deleteWorkspaceRemote(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("workspaces").delete().eq("id", id);
  if (error) throw error;
}
