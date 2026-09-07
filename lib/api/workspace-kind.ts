import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/data-backend";
import type { Workspace, WorkspaceKind } from "@/lib/types";

export async function updateWorkspaceKindRemote(
  workspaceId: string,
  kind: WorkspaceKind,
): Promise<Workspace | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sign in to update this workspace.");

  const response = await fetch("/api/workspace/kind", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ workspaceId, kind }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    workspace?: Workspace;
    error?: string;
  };
  if (!response.ok) throw new Error(data.error ?? "Could not update workspace type.");
  return data.workspace ?? null;
}
