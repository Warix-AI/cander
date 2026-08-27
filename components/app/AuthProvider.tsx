"use client";

import { useEffect } from "react";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { initSupabaseAuthSubscription } from "@/lib/supabase/auth-store";

/** Keeps Supabase session in sync with the client auth store. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    return initSupabaseAuthSubscription();
  }, []);

  return <>{children}</>;
}
