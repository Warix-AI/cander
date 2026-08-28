"use client";

import { syncAppearanceToSupabase } from "@/lib/api/appearance-sync";
import { clearAppearanceLocalState } from "@/lib/appearance";
import { isSupabaseConfigured } from "@/lib/data-backend";
import {
  getWorkspaceSnapshot,
  persistOnboardingPending,
  persistSignedOut,
  resetWorkspaceSession,
} from "@/lib/session";
import { signOutSupabase } from "@/lib/supabase/auth-actions";
import { clearSupabaseAuthState, getSupabaseUserIdSnapshot } from "@/lib/supabase/auth-store";
import { resetPolicyStoreState } from "@/lib/workspace-policy";

const LOCAL_KEYS = [
  "courier-signed-in",
  "courier-actor",
  "courier-workspace",
  "courier-sidebar",
  "courier-pins",
  "courier-hosting",
  "courier-personal-space",
  "courier-workspace-policies",
  "courier-org-members",
] as const;

function isAppearanceStorageKey(key: string) {
  return key === "courier-appearance-v2" || key.startsWith("courier-appearance-v2:");
}

/** Clear sticky local prototype state after sign-out / delete. */
export function clearLocalAuthState() {
  if (typeof window === "undefined") return;
  resetWorkspaceSession();
  for (const key of LOCAL_KEYS) {
    window.localStorage.removeItem(key);
  }
  const doomed: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith("courier-")) continue;
    if (isAppearanceStorageKey(key)) continue;
    doomed.push(key);
  }
  for (const key of doomed) window.localStorage.removeItem(key);
}

/**
 * Sign out of Supabase (when configured) and clear local session mirrors.
 * Safe to call from menus and settings.
 */
export async function signOutAccount() {
  if (isSupabaseConfigured()) {
    const userId = getSupabaseUserIdSnapshot();
    if (userId) {
      try {
        await syncAppearanceToSupabase({
          workspaceId: getWorkspaceSnapshot(),
          actorId: userId,
        });
      } catch (err) {
        console.warn("[cander] appearance flush on sign-out failed", err);
      }
    }
    clearSupabaseAuthState();
    persistOnboardingPending(false);
    resetPolicyStoreState();
    try {
      await signOutSupabase();
    } catch (err) {
      console.warn("[cander] signOut failed", err);
    }
  }
  clearAppearanceLocalState();
  clearLocalAuthState();
  persistSignedOut();
}
