"use client";

import { clearOnboardingCheckpoint } from "@/lib/onboarding-checkpoint";
import { clearLocalAuthState } from "@/lib/auth/sign-out";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { hydrateMemberFromSupabase } from "@/lib/supabase/hydrate-member";
import { syncSupabaseAuthUser } from "@/lib/supabase/auth-store";
import { persistActor, persistOnboardingPending } from "@/lib/session";

/** True when the user finished the in-app onboarding flow (not just signup trigger). */
export async function hasCompletedOnboarding(userId: string): Promise<boolean> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("onboarding_completed_at, short_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (/onboarding_completed_at|42703|column/i.test(error.message)) {
      const { data: legacy, error: legacyError } = await supabase
        .from("profiles")
        .select("short_name")
        .eq("id", userId)
        .maybeSingle();
      if (legacyError) {
        console.warn(
          "[cander] hasCompletedOnboarding check failed",
          legacyError.message,
        );
        return false;
      }
      return Boolean(legacy?.short_name?.trim());
    }
    console.warn("[cander] hasCompletedOnboarding check failed", error.message);
    return false;
  }

  return Boolean(data?.onboarding_completed_at);
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

  syncSupabaseAuthUser(user);

  const complete = await hasCompletedOnboarding(user.id);
  if (!complete) {
    persistOnboardingPending(true);
    return false;
  }

  try {
    clearLocalAuthState();
    await hydrateMemberFromSupabase(user);
  } catch (err) {
    console.warn("[cander] hydrate on recover failed", err);
    return false;
  }
  persistActor(user.id);
  persistOnboardingPending(false);
  clearOnboardingCheckpoint();
  return true;
}
