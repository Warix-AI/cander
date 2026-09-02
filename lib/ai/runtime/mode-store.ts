"use client";

import type { AiRuntimeMode } from "@/lib/ai/runtime/types";

const KEY = "cander-ai-runtime-mode";

/** OpenAI-only — persisted local/auto modes are ignored. */
export function getAiRuntimeMode(): AiRuntimeMode {
  return "cloud";
}

export function setAiRuntimeMode(mode: AiRuntimeMode) {
  if (typeof window === "undefined") return;
  // Only cloud is supported; normalize writes so UI stays consistent.
  window.localStorage.setItem(KEY, "cloud");
  if (mode !== "cloud") {
    window.localStorage.setItem("cander-ai-runtime-mode-legacy", mode);
  }
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
