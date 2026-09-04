"use client";

import { useSyncExternalStore } from "react";
import type { PinKind } from "@/lib/types";

export const PIN_KIND_ORDER: PinKind[] = ["connector", "project", "thread"];

export const PIN_KIND_LABEL: Record<PinKind, string> = {
  connector: "Connectors",
  project: "Projects",
  thread: "Chats",
};

export type PinDisplayPrefs = {
  /** Kinds currently visible in the Pinned list. */
  visible: PinKind[];
  /** Kind order when grouping (filter “show first”). */
  order: PinKind[];
  /** session = pin-time flat list; grouped = by kind using order. */
  organize: "session" | "grouped";
};

export const DEFAULT_PIN_DISPLAY_PREFS: PinDisplayPrefs = {
  visible: [...PIN_KIND_ORDER],
  order: [...PIN_KIND_ORDER],
  organize: "session",
};

const STORAGE_KEY = "cander:pin-display-prefs";

type Listener = () => void;
const listeners = new Set<Listener>();
let prefs: PinDisplayPrefs = DEFAULT_PIN_DISPLAY_PREFS;
let hydrated = false;

function normalizePrefs(raw: unknown): PinDisplayPrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PIN_DISPLAY_PREFS };
  const data = raw as Record<string, unknown>;
  const order = Array.isArray(data.order)
    ? data.order.filter((k): k is PinKind =>
        PIN_KIND_ORDER.includes(k as PinKind),
      )
    : [];
  const visible = Array.isArray(data.visible)
    ? data.visible.filter((k): k is PinKind =>
        PIN_KIND_ORDER.includes(k as PinKind),
      )
    : [];
  const organize =
    data.organize === "grouped" || data.organize === "session"
      ? data.organize
      : "session";
  return {
    organize,
    order: [
      ...order,
      ...PIN_KIND_ORDER.filter((k) => !order.includes(k)),
    ],
    visible: visible.length ? visible : [...PIN_KIND_ORDER],
  };
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) prefs = normalizePrefs(JSON.parse(raw));
  } catch {
    prefs = { ...DEFAULT_PIN_DISPLAY_PREFS };
  }
}

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribePinDisplayPrefs(listener: Listener) {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPinDisplayPrefsSnapshot(): PinDisplayPrefs {
  hydrate();
  return prefs;
}

export function getPinDisplayPrefsServerSnapshot(): PinDisplayPrefs {
  return DEFAULT_PIN_DISPLAY_PREFS;
}

export function persistPinDisplayPrefs(next: PinDisplayPrefs) {
  prefs = normalizePrefs(next);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }
  emit();
}

/** When pinning, force that kind visible so the item actually shows in the menu. */
export function ensurePinKindVisible(kind: PinKind) {
  hydrate();
  if (prefs.visible.includes(kind)) return;
  persistPinDisplayPrefs({
    ...prefs,
    visible: [...prefs.visible, kind],
  });
}

export function usePinDisplayPrefs() {
  const value = useSyncExternalStore(
    subscribePinDisplayPrefs,
    getPinDisplayPrefsSnapshot,
    getPinDisplayPrefsServerSnapshot,
  );

  return {
    prefs: value,
    setPrefs: persistPinDisplayPrefs,
    setOrganize: (organize: PinDisplayPrefs["organize"]) =>
      persistPinDisplayPrefs({ ...value, organize }),
    toggleVisible: (kind: PinKind) => {
      const has = value.visible.includes(kind);
      const visible = has
        ? value.visible.filter((k) => k !== kind)
        : [...value.visible, kind];
      // Keep at least one kind visible.
      persistPinDisplayPrefs({
        ...value,
        visible: visible.length ? visible : [kind],
      });
    },
    moveKind: (kind: PinKind, dir: -1 | 1) => {
      const order = [...value.order];
      const i = order.indexOf(kind);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= order.length) return;
      [order[i], order[j]] = [order[j]!, order[i]!];
      persistPinDisplayPrefs({ ...value, organize: "grouped", order });
    },
  };
}

export type PinnableRow = { kind: PinKind; id: string };

/** Flat session order, or grouped by kind — both respect visibility. */
export function organizePinnedItems<T extends PinnableRow>(
  items: T[],
  pinPrefs: PinDisplayPrefs,
): T[] {
  const visible = new Set(pinPrefs.visible);
  const filtered = items.filter((item) => visible.has(item.kind));
  if (pinPrefs.organize === "session") return filtered;

  const out: T[] = [];
  for (const kind of pinPrefs.order) {
    if (!visible.has(kind)) continue;
    for (const item of filtered) {
      if (item.kind === kind) out.push(item);
    }
  }
  return out;
}
