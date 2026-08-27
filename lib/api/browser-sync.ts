"use client";

import {
  getBrowserSessionRevision,
  getBrowserSessionSnapshot,
  replaceBrowserSessionState,
  subscribeBrowserSession,
} from "@/lib/browser-session";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { BrowserSessionRow } from "@/lib/supabase/build-mapper";
import type { WorkspaceCtx } from "@/lib/space-entities";

const IMPORT_FLAG = "courier-browser-imported-v1";
const SYNC_DEBOUNCE_MS = 600;

let skipRemoteSync = false;

function sessionStorageKey(profileId: string, workspaceId: string) {
  return `courier-browser-session:${profileId}:${workspaceId}`;
}

export async function hydrateBrowserSessionFromRemote(ctx: WorkspaceCtx) {
  skipRemoteSync = true;
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("browser_sessions")
    .select("*")
    .eq("profile_id", ctx.actorId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (error) throw error;

  if (data) {
    const row = data as BrowserSessionRow;
    replaceBrowserSessionState(ctx.actorId, ctx.workspaceId, {
      url: row.url,
      title: row.title,
    });
  }

  window.setTimeout(() => {
    skipRemoteSync = false;
  }, 0);
}

export async function syncBrowserSessionToSupabase(ctx: WorkspaceCtx) {
  const page = getBrowserSessionSnapshot(ctx.actorId, ctx.workspaceId);
  if (!page) return;

  const supabase = createSupabaseBrowserClient();
  const row: BrowserSessionRow = {
    profile_id: ctx.actorId,
    workspace_id: ctx.workspaceId,
    url: page.url,
    title: page.title,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("browser_sessions")
    .upsert(row, { onConflict: "profile_id,workspace_id" });
  if (error) throw error;
}

export async function importLocalBrowserSessionIfNeeded(ctx: WorkspaceCtx) {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(IMPORT_FLAG) === "1") return;

  const raw = window.localStorage.getItem(
    sessionStorageKey(ctx.actorId, ctx.workspaceId),
  );
  if (raw) {
    await syncBrowserSessionToSupabase(ctx);
  }

  window.localStorage.setItem(IMPORT_FLAG, "1");
}

export function startBrowserRemoteSync(ctx: WorkspaceCtx) {
  let lastRevision = getBrowserSessionRevision();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let syncing = false;

  const push = () => {
    if (syncing || skipRemoteSync) return;
    syncing = true;
    void syncBrowserSessionToSupabase(ctx)
      .catch((err) => {
        console.warn("[cander] browser session sync failed", err);
      })
      .finally(() => {
        syncing = false;
      });
  };

  const unsub = subscribeBrowserSession(() => {
    if (skipRemoteSync) return;
    const revision = getBrowserSessionRevision();
    if (revision === lastRevision) return;
    lastRevision = revision;
    if (timer) clearTimeout(timer);
    timer = setTimeout(push, SYNC_DEBOUNCE_MS);
  });

  return () => {
    if (timer) clearTimeout(timer);
    unsub();
  };
}

export function subscribeBrowserRealtime(
  ctx: WorkspaceCtx,
  onChange: () => void,
) {
  const supabase = createSupabaseBrowserClient();
  const channel = supabase
    .channel(`browser:${ctx.actorId}:${ctx.workspaceId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "browser_sessions",
        filter: `profile_id=eq.${ctx.actorId}`,
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function startBrowserRealtimePull(ctx: WorkspaceCtx) {
  let pulling = false;

  const pull = () => {
    if (pulling) return;
    pulling = true;
    void hydrateBrowserSessionFromRemote(ctx)
      .catch((err) => {
        console.warn("[cander] browser hydrate failed", err);
      })
      .finally(() => {
        pulling = false;
      });
  };

  return subscribeBrowserRealtime(ctx, pull);
}

export async function bootstrapSupabaseBrowser(ctx: WorkspaceCtx) {
  await importLocalBrowserSessionIfNeeded(ctx);
  await hydrateBrowserSessionFromRemote(ctx);
}

export function startSupabaseBrowserSync(ctx: WorkspaceCtx) {
  const stopRemote = startBrowserRemoteSync(ctx);
  const stopRealtime = startBrowserRealtimePull(ctx);
  return () => {
    stopRemote();
    stopRealtime();
  };
}
