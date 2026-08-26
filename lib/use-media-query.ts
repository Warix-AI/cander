"use client";

import { useSyncExternalStore } from "react";

function subscribeMediaQuery(query: string, callback: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getMediaQuerySnapshot(query: string) {
  return window.matchMedia(query).matches;
}

/** SSR-safe matchMedia; defaults to `false` until hydrated. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (callback) => subscribeMediaQuery(query, callback),
    () => getMediaQuerySnapshot(query),
    () => false,
  );
}

/** Shell mobile breakpoint — matches Tailwind `max-lg` / below 1024px. */
export function useMobileShell() {
  return useMediaQuery("(max-width: 1023px)");
}
