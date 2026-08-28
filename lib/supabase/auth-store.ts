"use client";

import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Listener = () => void;

const authListeners = new Set<Listener>();
const userListeners = new Set<Listener>();

let signedIn = false;
let authUser: User | null = null;
let initialized = false;
let validating = false;
let pendingValidation = false;

function emitAuth() {
  authListeners.forEach((listener) => listener());
}

function emitUser() {
  userListeners.forEach((listener) => listener());
}

function setSession(user: User | null) {
  const nextSignedIn = Boolean(user);
  const changed =
    nextSignedIn !== signedIn || (user?.id ?? null) !== (authUser?.id ?? null);
  authUser = user;
  signedIn = nextSignedIn;
  if (changed) {
    emitAuth();
    emitUser();
  }
}

/** Sync auth UI immediately after sign-in / OTP (before async validation). */
export function syncSupabaseAuthUser(user: User | null) {
  setSession(user);
}

export function clearSupabaseAuthState() {
  setSession(null);
}

/**
 * Validate the JWT against Auth (not just local storage).
 * Deleted / banned users fail here even if a stale session cookie remains.
 */
export async function validateSupabaseSession(): Promise<User | null> {
  if (!isSupabaseConfigured() || typeof window === "undefined") return null;
  if (validating) {
    pendingValidation = true;
    return authUser;
  }
  validating = true;
  try {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (user) {
      setSession(user);
      return user;
    }

    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status?: number }).status)
        : undefined;
    const message = (error?.message ?? "").toLowerCase();
    const revoked =
      status === 401 ||
      status === 403 ||
      /user.*(not found|deleted)|invalid (jwt|claim|token)|jwt expired|session.*(expired|missing)|not authenticated|forbidden/i.test(
        message,
      );

    // Network blips: keep the current local session until Auth confirms revoke.
    if (error && !revoked && authUser) {
      console.warn("[cander] session recheck deferred", error.message);
      return authUser;
    }

    await supabase.auth.signOut({ scope: "local" });
    setSession(null);
    return null;
  } catch (err) {
    console.warn("[cander] session validation failed", err);
    // Transient errors — do not wipe a working session.
    return authUser;
  } finally {
    validating = false;
    if (pendingValidation) {
      pendingValidation = false;
      queueMicrotask(() => {
        void validateSupabaseSession();
      });
    }
  }
}

/** Wire Supabase onAuthStateChange — call once from AuthProvider. */
export function initSupabaseAuthSubscription() {
  if (!isSupabaseConfigured() || initialized || typeof window === "undefined") {
    return () => {};
  }
  initialized = true;

  const supabase = createSupabaseBrowserClient();

  // Never trust getSession() alone — it only reads local storage / cookies.
  void validateSupabaseSession();

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      setSession(null);
      return;
    }
    // Flip UI immediately; validate in background so deleted users still drop.
    if (session?.user) {
      setSession(session.user);
      queueMicrotask(() => {
        void validateSupabaseSession();
      });
    } else {
      setSession(null);
    }
  });

  const onVisible = () => {
    if (document.visibilityState === "visible") {
      void validateSupabaseSession();
    }
  };
  const onFocus = () => {
    void validateSupabaseSession();
  };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onFocus);

  return () => {
    subscription.unsubscribe();
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onFocus);
    initialized = false;
  };
}

export function subscribeSupabaseAuth(listener: Listener) {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

export function getSupabaseAuthSnapshot() {
  return signedIn;
}

export function getSupabaseAuthServerSnapshot() {
  return false;
}

export function subscribeSupabaseUser(listener: Listener) {
  userListeners.add(listener);
  return () => {
    userListeners.delete(listener);
  };
}

export function getSupabaseUserSnapshot() {
  return authUser;
}

export function getSupabaseUserServerSnapshot() {
  return null;
}

export function getSupabaseUserIdSnapshot() {
  return authUser?.id ?? null;
}

export function getSupabaseUserIdServerSnapshot() {
  return null;
}

export function subscribeSupabaseUserId(listener: Listener) {
  return subscribeSupabaseUser(listener);
}
