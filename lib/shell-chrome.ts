import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

export type ShellStyle = "classic" | "floating";

type Listener = () => void;

const STORAGE_KEY = "courier-shell-style";
const listeners = new Set<Listener>();

/** G3 corner radius — matches composer-shell (20px). Use class only, not rounded-[20px]. */
export const SHELL_G3_RADIUS_PX = 20;
/** Electron desktop window outer radius — slightly larger than in-app G3 cards. */
export const DESKTOP_WINDOW_RADIUS_PX = 24;
export const SHELL_G3_RADIUS = "shell-g3-radius";
/** Floating shell inset — matches my-3 / ml-3 / mr-3 on menu and panels. */
export const SHELL_FLOAT_INSET_PX = 12;
/** Interior of a floating shell panel — inherits light-surface / composer-shell chrome. */
export const SHELL_PANEL_BODY = "flex h-full min-h-0 flex-col";
/** Scrollable panel body — transparent so the white shell shows through. */
export const SHELL_PANEL_SCROLL = "min-h-0 flex-1 overflow-y-auto";

/**
 * Project / browser chrome + canvas fill — matches Studio artboard black so
 * tab bars and content don’t read as two-tone charcoal-on-black.
 */
export const BROWSER_CHROME_BG = "bg-neutral-50 dark:bg-neutral-950";
/** Active / hover chips on browser chrome. */
export const BROWSER_CHROME_CHIP =
  "bg-black/[0.04] dark:bg-white/[0.08]";
export const BROWSER_CHROME_CHIP_HOVER =
  "hover:bg-black/[0.06] dark:hover:bg-white/[0.1]";

/** White floating control shell — toggles, icon buttons (light mode). */
export const FLOAT_CONTROL_SHELL =
  "border-[0.75px] border-[oklch(0.91_0.003_265)] bg-white dark:border-border dark:bg-muted/20";

/** Selected segment inside a floating toggle. */
export const FLOAT_TOGGLE_ACTIVE =
  "bg-background text-foreground dark:bg-muted";

/** Floating icon button — search, etc. */
export const FLOAT_ICON_BUTTON = cn(
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-foreground transition-colors duration-200 hover:bg-background dark:hover:bg-muted",
  FLOAT_CONTROL_SHELL,
);
/** @deprecated Use SHELL_G3_RADIUS — Tailwind rounded-[20px] is clamped by appearance sliders. */
export const SHELL_FLOAT_RADIUS = SHELL_G3_RADIUS;

let style: ShellStyle = "classic";
let hydrated = false;

function emit() {
  listeners.forEach((listener) => listener());
}

function parse(raw: string | null): ShellStyle {
  if (raw === "classic" || raw === "floating") return raw;
  return "classic";
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  style = parse(window.localStorage.getItem(STORAGE_KEY));
}

export function subscribeShellStyle(listener: Listener) {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getShellStyleSnapshot() {
  hydrate();
  return style;
}

export function getShellStyleServerSnapshot(): ShellStyle {
  return "classic";
}

export function setShellStyle(next: ShellStyle) {
  hydrate();
  if (style === next) return;
  style = next;
  window.localStorage.setItem(STORAGE_KEY, next);
  emit();
}

export function useShellStyle() {
  return useSyncExternalStore(
    subscribeShellStyle,
    getShellStyleSnapshot,
    getShellStyleServerSnapshot,
  );
}

export const SHELL_STYLES: {
  id: ShellStyle;
  label: string;
  description: string;
}[] = [
  {
    id: "classic",
    label: "Classic",
    description: "Edge-to-edge menu and banners with straight edges.",
  },
  {
    id: "floating",
    label: "Floating",
    description: "Inset menu and banners with rounded corners.",
  },
];
