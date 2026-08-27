"use client";

import { useEffect, useRef } from "react";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { clearLocalAuthState } from "@/lib/auth/sign-out";
import { persistOnboardingPending, persistSignedOut } from "@/lib/session";
import {
  getSupabaseUserSnapshot,
  initSupabaseAuthSubscription,
  subscribeSupabaseUser,
  validateSupabaseSession,
} from "@/lib/supabase/auth-store";
import { hydrateMemberFromSupabase } from "@/lib/supabase/hydrate-member";

/** Keeps Supabase session in sync with the client auth store + member roster. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const hadUser = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const stopAuth = initSupabaseAuthSubscription();

    const unsubUser = subscribeSupabaseUser(() => {
      const user = getSupabaseUserSnapshot();
      if (!user) {
        if (hadUser.current) {
          // User was deleted in Supabase (or signed out) — wipe sticky local mirrors.
          clearLocalAuthState();
          persistOnboardingPending(false);
          persistSignedOut();
        }
        hadUser.current = false;
        return;
      }
      hadUser.current = true;
      void hydrateMemberFromSupabase(user).catch((err) => {
        console.warn("[cander] member hydrate failed", err);
        // Profile gone / revoked — force a live Auth check.
        void validateSupabaseSession();
      });
    });

    const existing = getSupabaseUserSnapshot();
    if (existing) {
      hadUser.current = true;
      void hydrateMemberFromSupabase(existing).catch((err) => {
        console.warn("[cander] member hydrate failed", err);
        void validateSupabaseSession();
      });
    }

    return () => {
      stopAuth();
      unsubUser();
    };
  }, []);

  return <>{children}</>;
}
