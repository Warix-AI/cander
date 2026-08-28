"use client";

import {
  coerceProjectBrowserSession,
  defaultProjectBrowserSession,
  getLastChangedProjectBrowserKey,
  getProjectBrowserSession,
  getProjectBrowserSessionRevision,
  parseProjectBrowserStorageKey,
  replaceProjectBrowserWorkspaceState,
  subscribeProjectBrowserSession,
  type ProjectBrowserSession,
} from "@/lib/project-browser-session";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ProjectBrowserSessionRow } from "@/lib/supabase/build-mapper";
import type { WorkspaceCtx } from "@/lib/space-entities";
import type { SpaceId } from "@/lib/types";

const IMPORT_FLAG = "courier-project-browser-imported-v1";
const SYNC_DEBOUNCE_MS = 600;

let skipRemoteSync = false;

function isMissingTableError(error: { code?: string; message?: string }) {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /project_browser_sessions/i.test(error.message ?? "")
  );
}

function parseRow(row: ProjectBrowserSessionRow): ProjectBrowserSession | null {
  return coerceProjectBrowserSession({
    tabs: Array.isArray(row.tabs) ? (row.tabs as ProjectBrowserSession["tabs"]) : [],
    activeTabId: row.active_tab_id,
  });
}

export async function hydrateProjectBrowserFromRemote(ctx: WorkspaceCtx) {
  skipRemoteSync = true;
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("project_browser_sessions")
    .select("*")
    .eq("profile_id", ctx.actorId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) {
    if (isMissingTableError(error)) return;
    skipRemoteSync = false;
    throw error;
  }

  const sessions = (data as ProjectBrowserSessionRow[] | null ?? [])
    .map((row) => {
      const session = parseRow(row);
      if (!session) return null;
      if (
        row.space_id !== "work" &&
        row.space_id !== "build" &&
        row.space_id !== "research"
      ) {
        return null;
      }
      return {
        key: {
          profileId: row.profile_id,
          workspaceId: row.workspace_id,
          spaceId: row.space_id as SpaceId,
          projectId: row.project_id,
        },
        session,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  replaceProjectBrowserWorkspaceState(ctx.actorId, ctx.workspaceId, sessions);

  window.setTimeout(() => {
    skipRemoteSync = false;
  }, 0);
}

export async function syncProjectBrowserToSupabase(ctx: WorkspaceCtx) {
  const changed = getLastChangedProjectBrowserKey();
  const parsed = changed ? parseProjectBrowserStorageKey(changed) : null;
  if (!parsed) return;
  if (parsed.profileId !== ctx.actorId || parsed.workspaceId !== ctx.workspaceId) {
    return;
  }

  const session = getProjectBrowserSession(
    parsed,
    defaultProjectBrowserSession({
      projectId: parsed.projectId,
      title: "Project",
    }),
  );

  const supabase = createSupabaseBrowserClient();
  const row: ProjectBrowserSessionRow = {
    profile_id: parsed.profileId,
    workspace_id: parsed.workspaceId,
    space_id: parsed.spaceId,
    project_id: parsed.projectId,
    active_tab_id: session.activeTabId,
    tabs: session.tabs,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("project_browser_sessions")
    .upsert(row, {
      onConflict: "profile_id,workspace_id,space_id,project_id",
    });
  if (error) {
    if (isMissingTableError(error)) return;
    throw error;
  }
}

export async function importLocalProjectBrowserIfNeeded(_ctx: WorkspaceCtx) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(IMPORT_FLAG, "1");
}

export function startProjectBrowserRemoteSync(ctx: WorkspaceCtx) {
  let lastRevision = getProjectBrowserSessionRevision();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let syncing = false;

  const push = () => {
    if (syncing || skipRemoteSync) return;
    syncing = true;
    void syncProjectBrowserToSupabase(ctx)
      .catch((err) => {
        console.warn("[cander] project browser sync failed", err);
      })
      .finally(() => {
        syncing = false;
      });
  };

  const unsub = subscribeProjectBrowserSession(() => {
    if (skipRemoteSync) return;
    const next = getProjectBrowserSessionRevision();
    if (next === lastRevision) return;
    lastRevision = next;
    if (timer) clearTimeout(timer);
    timer = setTimeout(push, SYNC_DEBOUNCE_MS);
  });

  return () => {
    if (timer) clearTimeout(timer);
    unsub();
  };
}

export function subscribeProjectBrowserRealtime(
  ctx: WorkspaceCtx,
  onChange: () => void,
) {
  const supabase = createSupabaseBrowserClient();
  const channel = supabase
    .channel(`project-browser:${ctx.actorId}:${ctx.workspaceId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "project_browser_sessions",
        filter: `profile_id=eq.${ctx.actorId}`,
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function startProjectBrowserRealtimePull(ctx: WorkspaceCtx) {
  let pulling = false;

  const pull = () => {
    if (pulling) return;
    pulling = true;
    void hydrateProjectBrowserFromRemote(ctx)
      .catch((err) => {
        console.warn("[cander] project browser hydrate failed", err);
      })
      .finally(() => {
        pulling = false;
      });
  };

  return subscribeProjectBrowserRealtime(ctx, pull);
}

export async function bootstrapSupabaseProjectBrowser(ctx: WorkspaceCtx) {
  await importLocalProjectBrowserIfNeeded(ctx);
  await hydrateProjectBrowserFromRemote(ctx);
}

export function startSupabaseProjectBrowserSync(ctx: WorkspaceCtx) {
  const stopRemote = startProjectBrowserRemoteSync(ctx);
  const stopRealtime = startProjectBrowserRealtimePull(ctx);
  return () => {
    stopRemote();
    stopRealtime();
  };
}
