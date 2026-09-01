"use client";

import { resetChatStore } from "@/lib/api/chat-store";
import { resetSpaceEntityStore } from "@/lib/api/space-entity-store";
import { clearAppearanceLocalState } from "@/lib/appearance";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { persistOnboardingPending, persistSignedOut, resetWorkspaceSession } from "@/lib/session";
import { signOutSupabase } from "@/lib/supabase/auth-actions";
import { clearSupabaseAuthState } from "@/lib/supabase/auth-store";
import { resetPolicyStoreState } from "@/lib/workspace-policy";
import {
  clearConnectorConnectionsCache,
  purgeLegacyConnectionStorage,
} from "@/lib/connector-connections-store";

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
 * Local state clears immediately so the UI responds on mobile without waiting on network.
 */
export async function signOutAccount() {
  if (isSupabaseConfigured()) {
    void signOutSupabase().catch((err) => {
      console.warn("[cander] signOut failed", err);
    });
  }

  clearSupabaseAuthState();
  persistOnboardingPending(false);
  resetPolicyStoreState();
  resetSpaceEntityStore();
  resetChatStore();
  clearAppearanceLocalState();
  clearConnectorConnectionsCache();
  purgeLegacyConnectionStorage();
  clearLocalAuthState();
  persistSignedOut();
}
