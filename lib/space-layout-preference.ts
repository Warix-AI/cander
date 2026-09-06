import type { SpaceLayout } from "@/lib/types";
import { safeLocalStorageSetItem } from "@/lib/safe-local-storage";

const STORAGE_KEY = "courier-space-layout";

export function readSpaceLayoutPreference(): SpaceLayout {
  if (typeof window === "undefined") return "cards";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === "list" ? "list" : "cards";
}

export function writeSpaceLayoutPreference(layout: SpaceLayout) {
  safeLocalStorageSetItem(STORAGE_KEY, layout);
}
