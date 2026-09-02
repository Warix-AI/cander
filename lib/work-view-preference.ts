import { safeLocalStorageSetItem } from "@/lib/safe-local-storage";

export type WorkScreenView = "today" | "space";

const STORAGE_KEY = "courier-work-screen-view";

/** Default matches Build / Home / Studio — collection grid, not Today briefing. */
export function readWorkScreenView(): WorkScreenView {
  if (typeof window === "undefined") return "space";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === "today") return "today";
  return "space";
}

export function writeWorkScreenView(view: WorkScreenView) {
  safeLocalStorageSetItem(STORAGE_KEY, view);
}
