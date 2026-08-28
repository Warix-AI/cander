"use client";

import { isSupabaseConfigured } from "@/lib/data-backend";

type Listener = () => void;

const listeners = new Set<Listener>();
let sessionReady = !isSupabaseConfigured();

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
