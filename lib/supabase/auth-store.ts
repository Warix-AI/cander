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

function emitAuth() {
  authListeners.forEach((listener) => listener());
}

function emitUser() {
  userListeners.forEach((listener) => listener());
}

function setSession(user: User | null) {
  authUser = user;
  signedIn = Boolean(user);
  emitAuth();
  emitUser();
}

/** Wire Supabase onAuthStateChange — call once from AuthProvider. */
export function initSupabaseAuthSubscription() {
  if (!isSupabaseConfigured() || initialized || typeof window === "undefined") {
    return () => {};
  }
  initialized = true;

  const supabase = createSupabaseBrowserClient();

  void supabase.auth.getSession().then(({ data }) => {
    setSession(data.session?.user ?? null);
  });

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session?.user ?? null);
  });

  return () => {
    subscription.unsubscribe();
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
