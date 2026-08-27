"use client";

import { clearOnboardingCheckpoint } from "@/lib/onboarding-checkpoint";
import { clearLocalAuthState } from "@/lib/auth/sign-out";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { hydrateMemberFromSupabase } from "@/lib/supabase/hydrate-member";
import { persistActor, persistOnboardingPending } from "@/lib/session";

/** True when the user already has at least one workspace membership. */
export async function hasCompletedOnboarding(userId: string): Promise<boolean> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("profile_id", userId)
    .limit(1);
  if (error) {
    // Privilege / recursive RLS — cannot prove completion from DB.
    console.warn("[cander] hasCompletedOnboarding check failed", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * If the signed-in user finished setup previously but onboardingPending is stuck,
 * hydrate their profile and enter the app.
 */
export async function tryEnterExistingAccount(): Promise<boolean> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const complete = await hasCompletedOnboarding(user.id);
  if (!complete) return false;

  try {
    clearLocalAuthState();
    await hydrateMemberFromSupabase(user);
  } catch (err) {
    console.warn("[cander] hydrate on recover failed", err);
  }
  persistActor(user.id);
  persistOnboardingPending(false);
  clearOnboardingCheckpoint();
  return true;
}
