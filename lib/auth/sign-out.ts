"use client";

import { isSupabaseConfigured } from "@/lib/data-backend";
import { persistOnboardingPending, persistSignedOut } from "@/lib/session";
import { signOutSupabase } from "@/lib/supabase/auth-actions";
import { clearSupabaseAuthState } from "@/lib/supabase/auth-store";
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

/** Clear sticky local prototype state after sign-out / delete. */
export function clearLocalAuthState() {
  if (typeof window === "undefined") return;
  for (const key of LOCAL_KEYS) {
    window.localStorage.removeItem(key);
  }
  // Import flags and banners — wipe anything courier-* so hydrate starts clean.
  const doomed: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key?.startsWith("courier-")) doomed.push(key);
  }
  for (const key of doomed) window.localStorage.removeItem(key);
}

/**
 * Sign out of Supabase (when configured) and clear local session mirrors.
 * Safe to call from menus and settings.
 */
export async function signOutAccount() {
  if (isSupabaseConfigured()) {
    clearSupabaseAuthState();
    persistOnboardingPending(false);
    resetPolicyStoreState();
    try {
      await signOutSupabase();
    } catch (err) {
      console.warn("[cander] signOut failed", err);
    }
  }
  clearLocalAuthState();
  persistSignedOut();
}
