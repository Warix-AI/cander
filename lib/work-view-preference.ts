import { safeLocalStorageSetItem } from "@/lib/safe-local-storage";

export type WorkScreenView = "today" | "space";

const STORAGE_KEY = "courier-work-screen-view";

export function readWorkScreenView(): WorkScreenView {
  if (typeof window === "undefined") return "today";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === "space" ? "space" : "today";
}

export function writeWorkScreenView(view: WorkScreenView) {
  safeLocalStorageSetItem(STORAGE_KEY, view);
}
