"use client";

import { useSyncExternalStore } from "react";

const mediaSubscribers = new Map<string, (onStoreChange: () => void) => () => void>();

function subscribeMediaQuery(query: string, callback: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function subscribeToQuery(query: string) {
  const existing = mediaSubscribers.get(query);
  if (existing) return existing;
  const subscribe = (onStoreChange: () => void) =>
    subscribeMediaQuery(query, onStoreChange);
  mediaSubscribers.set(query, subscribe);
  return subscribe;
}

function getMediaQuerySnapshot(query: string) {
  return window.matchMedia(query).matches;
}

function getMediaQueryServerSnapshot() {
  return false;
}

/** SSR-safe matchMedia; defaults to `false` until hydrated. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    subscribeToQuery(query),
    () => getMediaQuerySnapshot(query),
    getMediaQueryServerSnapshot,
  );
}

/** Shell mobile breakpoint — matches Tailwind `max-lg` / below 1024px. */
export function useMobileShell() {
  return useMediaQuery("(max-width: 1023px)");
}
