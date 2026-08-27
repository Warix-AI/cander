"use client";

import { createBrowserClient } from "@supabase/ssr";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/** Browser Supabase client. Throws if env is not configured. */
export function createSupabaseBrowserClient() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured");
  }
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
