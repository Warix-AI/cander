"use client";

import {
  DEFAULT_APPEARANCE,
  getAppearanceSnapshot,
  replaceAppearanceState,
  subscribeAppearance,
  type AppearanceState,
} from "@/lib/appearance";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { WorkspaceCtx } from "@/lib/space-entities";

const APPEARANCE_IMPORT_FLAG = "courier-appearance-imported-v1";
const SYNC_DEBOUNCE_MS = 600;

let skipRemoteSync = false;

function parseRemoteAppearance(raw: unknown): AppearanceState | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<AppearanceState> & { color?: number };
  return {
    colorMode:
      data.colorMode === "dark" || data.colorMode === "light"
        ? data.colorMode
        : DEFAULT_APPEARANCE.colorMode,
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

export async function syncAppearanceToSupabase(ctx: WorkspaceCtx) {
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

export async function hydrateAppearanceFromRemote(ctx: WorkspaceCtx) {
  skipRemoteSync = true;
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("user_appearance")
    .select("appearance")
    .eq("profile_id", ctx.actorId)
    .maybeSingle();

  if (error) {
    if (/user_appearance|42P01|42703/i.test(error.message)) {
      skipRemoteSync = false;
      return;
    }
    throw error;
  }

  const remote = parseRemoteAppearance(data?.appearance);
  if (remote) {
    replaceAppearanceState(remote);
  }

  window.setTimeout(() => {
    skipRemoteSync = false;
  }, 0);
}

/** Push local appearance once, then keep remote in sync. */
export async function bootstrapSupabaseAppearance(ctx: WorkspaceCtx) {
  if (typeof window === "undefined") return;

  const imported = window.localStorage.getItem(APPEARANCE_IMPORT_FLAG) === "1";
  if (!imported) {
    try {
      await syncAppearanceToSupabase(ctx);
      window.localStorage.setItem(APPEARANCE_IMPORT_FLAG, "1");
    } catch (err) {
      console.warn("[cander] appearance import failed", err);
    }
  }

  await hydrateAppearanceFromRemote(ctx);
}

export function startAppearanceRemoteSync(ctx: WorkspaceCtx) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let syncing = false;

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
    if (timer) clearTimeout(timer);
    timer = setTimeout(push, SYNC_DEBOUNCE_MS);
  });

  return () => {
    if (timer) clearTimeout(timer);
    unsub();
  };
}
