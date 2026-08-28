"use client";

import type { EmailOtpType, User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { syncSupabaseAuthUser } from "@/lib/supabase/auth-store";

export type EmailVerifyLandingResult = "verified" | "error" | "none";

function stripAuthParams() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("token_hash");
  url.searchParams.delete("type");
  url.searchParams.delete("auth");
  if (url.hash.includes("access_token")) {
    url.hash = "";
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

async function readAuthUser(): Promise<User | null> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return user;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user ?? null;
}

/** Cookies from /auth/callback can land a tick after first paint — retry briefly. */
async function waitForAuthUser(maxMs = 2500): Promise<User | null> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const user = await readAuthUser();
    if (user) return user;
    await new Promise((resolve) => window.setTimeout(resolve, 120));
  }
  return null;
}

async function finishVerified(user: User): Promise<EmailVerifyLandingResult> {
  syncSupabaseAuthUser(user);
  stripAuthParams();
  return "verified";
}

/** Legacy implicit-flow links put tokens in the URL hash. */
async function exchangeHashSession(): Promise<User | null> {
  if (typeof window === "undefined" || !window.location.hash.includes("access_token")) {
    return null;
  }
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error || !data.session?.user) return null;
  return data.session.user;
}

/** Exchange email-link query params for a live session (PKCE code or token_hash). */
export async function completeEmailVerificationFromUrl(): Promise<EmailVerifyLandingResult> {
  if (typeof window === "undefined") return "none";

  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  const auth = params.get("auth");

  const hashUser = await exchangeHashSession();
  if (hashUser) return finishVerified(hashUser);

  if (!code && !tokenHash && auth !== "verified" && auth !== "error") {
    return "none";
  }

  const supabase = createSupabaseBrowserClient();

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session?.user) {
      return finishVerified(data.session.user);
    }
  }

  if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (!error && data.session?.user) {
      return finishVerified(data.session.user);
    }
  }

  if (auth === "verified" || auth === "error" || code || tokenHash) {
    const user = await waitForAuthUser(auth === "verified" ? 2500 : 800);
    if (user) return finishVerified(user);
  }

  if (auth === "error" && !code && !tokenHash) {
    stripAuthParams();
    return "error";
  }

  if (code || tokenHash) {
    stripAuthParams();
    return "error";
  }

  return "none";
}
