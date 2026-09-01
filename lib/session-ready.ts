"use client";

import { isSupabaseConfigured } from "@/lib/data-backend";

type Listener = () => void;

const listeners = new Set<Listener>();

/** True when localStorage still holds a Supabase auth token (sync, pre-network). */
export function hasCachedSupabaseSession() {
  if (!isSupabaseConfigured() || typeof window === "undefined") return false;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key?.endsWith("-auth-token")) continue;
      const raw = window.localStorage.getItem(key);
      if (raw && raw !== "null") return true;
    }
  } catch {
    return false;
  }
  return false;
}

let sessionReady =
  !isSupabaseConfigured() || hasCachedSupabaseSession();

function emit() {
  listeners.forEach((listener) => listener());
}

/** False until AuthProvider finishes the first Supabase session reconcile. */
export function setSessionReady(ready: boolean) {
  if (sessionReady === ready) return;
  sessionReady = ready;
  emit();
}

export function subscribeSessionReady(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSessionReadySnapshot() {
  return sessionReady;
}

export function getSessionReadyServerSnapshot() {
  return true;
}
