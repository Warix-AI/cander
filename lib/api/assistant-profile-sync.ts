"use client";

import {
  clampAssistantProfile,
  DEFAULT_ASSISTANT_PROFILE,
  getAssistantProfileSnapshot,
  hydrateAssistantProfile,
  mergeAssistantProfiles,
  subscribeAssistantProfile,
  type AssistantProfile,
} from "@/lib/voice/assistant-profile";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { WorkspaceCtx } from "@/lib/space-entities";

const SYNC_DEBOUNCE_MS = 700;
const FLUSH_EVENT = "cander:assistant-profile-flush";

let skipRemoteSync = false;

function isValidActorId(actorId: string) {
  return /^[0-9a-f-]{36}$/i.test(actorId);
}

function isDefaultProfile(state: AssistantProfile) {
  return JSON.stringify(state) === JSON.stringify(DEFAULT_ASSISTANT_PROFILE);
}

function hasRemotePreference(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  return Object.keys(raw as object).length > 0;
}

function parseRemoteProfile(raw: unknown): AssistantProfile | null {
  if (!hasRemotePreference(raw)) return null;
  return clampAssistantProfile(raw as Partial<AssistantProfile>);
}

async function fetchRemoteProfile(ctx: WorkspaceCtx) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("user_assistant_profile")
    .select("profile, updated_at")
    .eq("profile_id", ctx.actorId)
    .maybeSingle();

  if (error) {
    if (/user_assistant_profile|42P01|42703/i.test(error.message)) {
      return { remote: null as AssistantProfile | null };
    }
    throw error;
  }

  return {
    remote: parseRemoteProfile(data?.profile),
  };
}

export async function syncAssistantProfileToSupabase(ctx: WorkspaceCtx) {
  if (!isValidActorId(ctx.actorId)) return;
  const supabase = createSupabaseBrowserClient();
  const profile = getAssistantProfileSnapshot();
  const { error } = await supabase.from("user_assistant_profile").upsert(
    {
      profile_id: ctx.actorId,
      profile,
    },
    { onConflict: "profile_id" },
  );
  if (error) throw error;
}

/** Immediate push so names/voice survive refresh before debounce fires. */
export function flushAssistantProfileRemoteSync(ctx: WorkspaceCtx) {
  if (!isValidActorId(ctx.actorId) || skipRemoteSync) return;
  void syncAssistantProfileToSupabase(ctx).catch((err) => {
    console.warn("[cander] assistant profile flush failed", err);
  });
}

export function requestAssistantProfileFlush() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FLUSH_EVENT));
}

export async function bootstrapSupabaseAssistantProfile(ctx: WorkspaceCtx) {
  if (typeof window === "undefined" || !isValidActorId(ctx.actorId)) return;

  skipRemoteSync = true;
  try {
    const { remote } = await fetchRemoteProfile(ctx);
    const local = getAssistantProfileSnapshot();

    if (remote) {
      const merged = mergeAssistantProfiles(remote, local);
      hydrateAssistantProfile(merged);
      if (
        (local.assistantName && !remote.assistantName) ||
        (local.userName && !remote.userName)
      ) {
        window.setTimeout(() => {
          skipRemoteSync = false;
          flushAssistantProfileRemoteSync(ctx);
        }, 0);
        return;
      }
      return;
    }

    if (!isDefaultProfile(local)) {
      await syncAssistantProfileToSupabase(ctx);
    }
  } catch (err) {
    console.warn("[cander] assistant profile bootstrap failed", err);
  } finally {
    window.setTimeout(() => {
      skipRemoteSync = false;
    }, 0);
  }
}

export function startAssistantProfileRemoteSync(ctx: WorkspaceCtx) {
  if (!isValidActorId(ctx.actorId)) return () => {};

  let timer: ReturnType<typeof setTimeout> | null = null;
  let syncing = false;
  let lastSnapshot = getAssistantProfileSnapshot();

  const push = () => {
    if (syncing || skipRemoteSync) return;
    syncing = true;
    void syncAssistantProfileToSupabase(ctx)
      .catch((err) => {
        console.warn("[cander] assistant profile sync failed", err);
      })
      .finally(() => {
        syncing = false;
      });
  };

  const onFlush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    push();
  };

  const unsub = subscribeAssistantProfile(() => {
    if (skipRemoteSync) return;
    const next = getAssistantProfileSnapshot();
    if (JSON.stringify(next) === JSON.stringify(lastSnapshot)) return;
    lastSnapshot = { ...next };
    if (timer) clearTimeout(timer);
    timer = setTimeout(push, SYNC_DEBOUNCE_MS);
  });

  window.addEventListener(FLUSH_EVENT, onFlush);

  return () => {
    if (timer) clearTimeout(timer);
    window.removeEventListener(FLUSH_EVENT, onFlush);
    unsub();
  };
}
