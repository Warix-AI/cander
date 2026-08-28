"use client";

import { useEffect, useRef } from "react";
import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { clearLocalAuthState } from "@/lib/auth/sign-out";
import { hasCompletedOnboarding } from "@/lib/onboarding-recovery";
import { persistOnboardingPending, persistSignedOut } from "@/lib/session";
import {
  getSupabaseUserSnapshot,
  initSupabaseAuthSubscription,
  subscribeSupabaseUser,
  validateSupabaseSession,
} from "@/lib/supabase/auth-store";
import { hydrateMemberFromSupabase } from "@/lib/supabase/hydrate-member";
import { setSessionReady } from "@/lib/session-ready";

async function reconcileSupabaseUser(user: User) {
  const complete = await hasCompletedOnboarding(user.id);
  if (complete) {
    persistOnboardingPending(false);
    try {
      clearLocalAuthState();
      await hydrateMemberFromSupabase(user);
    } catch (err) {
      console.warn("[cander] member hydrate failed", err);
      void validateSupabaseSession();
    }
    return;
  }

  persistOnboardingPending(true);
}

/** Keeps Supabase session in sync with the client auth store + member roster. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const hadUser = useRef(false);
  const reconciling = useRef<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setSessionReady(true);
      return;
    }
    setSessionReady(false);
    const stopAuth = initSupabaseAuthSubscription();

    const reconcileIfNeeded = (user: User | null) => {
      if (!user) {
        if (hadUser.current) {
          clearLocalAuthState();
          persistOnboardingPending(false);
          persistSignedOut();
        }
        hadUser.current = false;
        reconciling.current = null;
        setSessionReady(true);
        return;
      }

      if (reconciling.current === user.id) return;
      reconciling.current = user.id;
      hadUser.current = true;
      void reconcileSupabaseUser(user)
        .catch((err) => {
          console.warn("[cander] session reconcile failed", err);
        })
        .finally(() => {
          if (reconciling.current === user.id) {
            reconciling.current = null;
          }
          setSessionReady(true);
        });
    };

    const unsubUser = subscribeSupabaseUser(() => {
      reconcileIfNeeded(getSupabaseUserSnapshot());
    });

    const existing = getSupabaseUserSnapshot();
    if (existing) {
      reconcileIfNeeded(existing);
    } else {
      void validateSupabaseSession().finally(() => setSessionReady(true));
    }

    return () => {
      stopAuth();
      unsubUser();
    };
  }, []);

  return <>{children}</>;
}
