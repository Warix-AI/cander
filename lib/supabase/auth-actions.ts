"use client";

import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type AuthCredentials = {
  email: string;
  password: string;
  name?: string;
};

export async function signInWithPassword({ email, password }: AuthCredentials) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  return data;
}

export async function signUpWithPassword({
  email,
  password,
  name,
}: AuthCredentials) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: name ? { name: name.trim() } : undefined,
    },
  });
  if (error) throw error;
  return data;
}

export async function signInWithMagicLink(email: string) {
  const supabase = createSupabaseBrowserClient();
  const redirectTo = `${window.location.origin}/auth/callback`;
  const { data, error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
  return data;
}

export async function signOutSupabase() {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function authDisplayName(user: User | null | undefined) {
  if (!user) return "User";
  const meta = user.user_metadata?.name;
  if (typeof meta === "string" && meta.trim()) return meta.trim();
  return user.email?.split("@")[0] ?? "User";
}

export function authEmail(user: User | null | undefined) {
  return user?.email ?? "";
}
