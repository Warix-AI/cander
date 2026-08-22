import { useSyncExternalStore } from "react";

export type ShellStyle = "classic" | "floating";

type Listener = () => void;

const STORAGE_KEY = "courier-shell-style";
const listeners = new Set<Listener>();

/** Shared float chrome for the menu card and space banners. */
export const SHELL_FLOAT_RADIUS = "rounded-[18px]";

let style: ShellStyle = "floating";
let hydrated = false;

function emit() {
  listeners.forEach((listener) => listener());
}

function parse(raw: string | null): ShellStyle {
  if (raw === "classic" || raw === "floating") return raw;
  return "floating";
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
  return "floating";
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
