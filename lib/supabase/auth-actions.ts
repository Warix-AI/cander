"use client";

import type { Provider, User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type AuthCredentials = {
  email: string;
  password: string;
  name?: string;
};

export type OAuthProvider = "google" | "apple";

const OAUTH_PROVIDERS: OAuthProvider[] = ["google", "apple"];

export function isOAuthProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

function authRedirect(path = "/auth/callback") {
  const next = typeof window !== "undefined" ? window.location.origin : "";
  return `${next}${path}`;
}

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
      emailRedirectTo: authRedirect("/auth/callback"),
    },
  });
  if (error) throw error;
  return data;
}

/** Confirm signup with the 6-digit code from the email (ChatGPT-style). */
export async function verifySignupOtp(email: string, token: string) {
  const supabase = createSupabaseBrowserClient();
  const trimmed = email.trim();
  const code = token.replace(/\s/g, "");
  const first = await supabase.auth.verifyOtp({
    email: trimmed,
    token: code,
    type: "signup",
  });
  if (!first.error) return first.data;
  // Some projects send the code via the generic email OTP template.
  const second = await supabase.auth.verifyOtp({
    email: trimmed,
    token: code,
    type: "email",
  });
  if (second.error) throw second.error;
  return second.data;
}

/** Resend the signup confirmation email / OTP. */
export async function resendSignupEmail(email: string) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.resend({
    type: "signup",
    email: email.trim(),
    options: { emailRedirectTo: authRedirect("/auth/callback") },
  });
  if (error) throw error;
  return data;
}

export async function signInWithMagicLink(email: string) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: authRedirect("/auth/callback") },
  });
  if (error) throw error;
  return data;
}

export async function signInWithOAuth(provider: OAuthProvider) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as Provider,
    options: {
      redirectTo: authRedirect("/auth/callback"),
      skipBrowserRedirect: false,
    },
  });
  if (error) throw error;
  return data;
}

export async function signOutSupabase() {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function requestPasswordReset(email: string) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.resetPasswordForEmail(
    email.trim(),
    { redirectTo: authRedirect("/auth/callback?next=/auth/reset") },
  );
  if (error) throw error;
  return data;
}

export async function updatePassword(password: string) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  return data;
}

export async function updateEmail(email: string) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.updateUser(
    { email: email.trim() },
    { emailRedirectTo: authRedirect("/auth/callback?next=/") },
  );
  if (error) throw error;
  return data;
}

export async function updateDisplayName(name: string) {
  const supabase = createSupabaseBrowserClient();
  const trimmed = name.trim();
  const { data, error } = await supabase.auth.updateUser({
    data: { name: trimmed },
  });
  if (error) throw error;
  await supabase
    .from("profiles")
    .update({ name: trimmed })
    .eq("id", data.user.id);
  return data;
}

/** Deletes the signed-in Auth user via a server route (service role). */
export async function deleteAccount() {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("You must be signed in to delete your account.");
  }

  const response = await fetch("/api/account/delete", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
  });

  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error || "Could not delete account.");
  }

  try {
    await supabase.auth.signOut();
  } catch {
    // User row may already be gone — local clear still runs in the UI.
  }
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

export function authProviders(user: User | null | undefined): string[] {
  if (!user) return [];
  const identities = user.identities ?? [];
  return identities.map((item) => item.provider).filter(Boolean);
}
