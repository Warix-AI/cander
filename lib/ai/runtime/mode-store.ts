"use client";

import type { AiRuntimeMode } from "@/lib/ai/runtime/types";

const KEY = "cander-ai-runtime-mode";

export function getAiRuntimeMode(): AiRuntimeMode {
  if (typeof window === "undefined") return "auto";
  const raw = window.localStorage.getItem(KEY);
  if (raw === "local" || raw === "cloud" || raw === "auto") return raw;
  return "auto";
}

export function setAiRuntimeMode(mode: AiRuntimeMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, mode);
  window.dispatchEvent(new Event("cander-ai-runtime-mode"));
}

export function subscribeAiRuntimeMode(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("cander-ai-runtime-mode", listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("cander-ai-runtime-mode", listener);
  };
}
