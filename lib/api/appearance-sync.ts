"use client";

import {
  DEFAULT_APPEARANCE,
  getAppearanceSnapshot,
  migrateColorModeForSync,
  replaceAppearanceState,
  subscribeAppearance,
  type AppearanceState,
} from "@/lib/appearance";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { WorkspaceCtx } from "@/lib/space-entities";

const SYNC_DEBOUNCE_MS = 600;

let skipRemoteSync = false;
let lastColorModeSync: Promise<void> | null = null;

function isValidActorId(actorId: string) {
  return /^[0-9a-f-]{36}$/i.test(actorId);
}

function appearanceEquals(a: AppearanceState, b: AppearanceState) {
  return (
    a.colorMode === b.colorMode &&
    a.typography === b.typography &&
    a.spacing === b.spacing &&
    a.shapes === b.shapes &&
    a.motion === b.motion &&
    a.layout === b.layout
  );
}

function isDefaultAppearance(state: AppearanceState) {
  return appearanceEquals(state, DEFAULT_APPEARANCE);
}

function hasRemotePreference(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const data = raw as Record<string, unknown>;
  if (Object.keys(data).length === 0) return false;
  return (
    data.colorMode !== undefined ||
    typeof data.typography === "number" ||
    typeof data.spacing === "number" ||
    typeof data.shapes === "number" ||
    typeof data.motion === "number" ||
    typeof data.layout === "number" ||
    typeof data.color === "number"
  );
}

function parseRemoteAppearance(raw: unknown): AppearanceState | null {
  if (!hasRemotePreference(raw)) return null;
  const data = raw as Partial<AppearanceState> & { color?: number };
  const colorMode =
    data.colorMode !== undefined
      ? migrateColorModeForSync(data.colorMode)
      : typeof data.color === "number"
        ? migrateColorModeForSync(data.color < 45 ? "light" : "dark")
        : DEFAULT_APPEARANCE.colorMode;
  return {
    colorMode,
    typography:
      typeof data.typography === "number"
        ? data.typography
        : DEFAULT_APPEARANCE.typography,
    spacing:
      typeof data.spacing === "number" ? data.spacing : DEFAULT_APPEARANCE.spacing,
    shapes:
      typeof data.shapes === "number" ? data.shapes : DEFAULT_APPEARANCE.shapes,
    motion:
      typeof data.motion === "number" ? data.motion : DEFAULT_APPEARANCE.motion,
    layout:
      typeof data.layout === "number" ? data.layout : DEFAULT_APPEARANCE.layout,
  };
}

async function fetchRemoteAppearance(ctx: WorkspaceCtx) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("user_appearance")
    .select("appearance, updated_at")
    .eq("profile_id", ctx.actorId)
    .maybeSingle();

  if (error) {
    if (/user_appearance|42P01|42703/i.test(error.message)) {
      return { remote: null as AppearanceState | null, updatedAt: null as string | null };
    }
    throw error;
  }

  return {
    remote: parseRemoteAppearance(data?.appearance),
    updatedAt:
      typeof data?.updated_at === "string" ? data.updated_at : null,
  };
}

export async function syncAppearanceToSupabase(ctx: WorkspaceCtx) {
  if (!isValidActorId(ctx.actorId)) return;
  const supabase = createSupabaseBrowserClient();
  const appearance = getAppearanceSnapshot();
  const { error } = await supabase.from("user_appearance").upsert(
    {
      profile_id: ctx.actorId,
      appearance,
    },
    { onConflict: "profile_id" },
  );
  if (error) throw error;
}

/** Immediate push for theme changes (no debounce). */
export function flushAppearanceColorModeSync(ctx: WorkspaceCtx) {
  if (!isValidActorId(ctx.actorId)) return;
  lastColorModeSync = syncAppearanceToSupabase(ctx).catch((err) => {
    console.warn("[cander] appearance colorMode sync failed", err);
  });
}

export async function hydrateAppearanceFromRemote(ctx: WorkspaceCtx) {
  if (!isValidActorId(ctx.actorId)) return;

  skipRemoteSync = true;
  try {
    const { remote } = await fetchRemoteAppearance(ctx);
    if (remote) {
      replaceAppearanceState(remote);
    }
  } finally {
    window.setTimeout(() => {
      skipRemoteSync = false;
    }, 0);
  }
}

/** Push local first, then hydrate remote when it differs. */
export async function bootstrapSupabaseAppearance(ctx: WorkspaceCtx) {
  if (typeof window === "undefined" || !isValidActorId(ctx.actorId)) return;

  const local = getAppearanceSnapshot();

  try {
    await syncAppearanceToSupabase(ctx);
  } catch (err) {
    console.warn("[cander] appearance push failed", err);
  }

  const { remote } = await fetchRemoteAppearance(ctx);
  if (!remote) return;

  if (isDefaultAppearance(local) && !isDefaultAppearance(remote)) {
    replaceAppearanceState(remote);
    return;
  }

  if (!appearanceEquals(local, remote)) {
    try {
      await syncAppearanceToSupabase(ctx);
    } catch (err) {
      console.warn("[cander] appearance reconcile push failed", err);
      replaceAppearanceState(remote);
    }
  }
}

export function startAppearanceRemoteSync(ctx: WorkspaceCtx) {
  if (!isValidActorId(ctx.actorId)) return () => {};

  let timer: ReturnType<typeof setTimeout> | null = null;
  let syncing = false;
  let lastSnapshot = getAppearanceSnapshot();

  const push = () => {
    if (syncing || skipRemoteSync) return;
    syncing = true;
    void syncAppearanceToSupabase(ctx)
      .catch((err) => {
        console.warn("[cander] appearance sync failed", err);
      })
      .finally(() => {
        syncing = false;
      });
  };

  const unsub = subscribeAppearance(() => {
    if (skipRemoteSync) return;
    const next = getAppearanceSnapshot();
    if (appearanceEquals(next, lastSnapshot)) return;
    const colorModeChanged = next.colorMode !== lastSnapshot.colorMode;
    lastSnapshot = { ...next };

    if (colorModeChanged) {
      if (timer) clearTimeout(timer);
      flushAppearanceColorModeSync(ctx);
      return;
    }

    if (timer) clearTimeout(timer);
    timer = setTimeout(push, SYNC_DEBOUNCE_MS);
  });

  return () => {
    if (timer) clearTimeout(timer);
    unsub();
  };
}

export { isValidActorId as isAppearanceActorId };
