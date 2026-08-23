import type { UltraLicense, UltraScope, UltraSeatKind } from "@/lib/types";

type Listener = () => void;

const listeners = new Set<Listener>();
const STORAGE_KEY = "courier-ultra-licenses";

let licenses: UltraLicense[] = [];
let hydrated = false;

function emit() {
  listeners.forEach((listener) => listener());
}

function parse(raw: string | null): UltraLicense[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter(
      (item): item is UltraLicense =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        (item.scope === "org" || item.scope === "personal") &&
        (item.kind === "user" || item.kind === "machine") &&
        (item.userId === null || typeof item.userId === "string"),
    );
  } catch {
    return [];
  }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  licenses = parse(window.localStorage.getItem(STORAGE_KEY));
}

export function subscribeUltraLicenses(listener: Listener) {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getUltraLicensesSnapshot() {
  return licenses;
}

export function getUltraLicensesServerSnapshot(): UltraLicense[] {
  return [];
}

function persist(next: UltraLicense[]) {
  licenses = next;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(licenses));
  emit();
}

export function addUltraLicense(input: {
  kind: UltraSeatKind;
  scope: UltraScope;
  userId?: string | null;
  label?: string;
}) {
  hydrate();
  const license: UltraLicense = {
    id: `ultra-${Date.now().toString(36)}`,
    kind: input.kind,
    scope: input.scope,
    userId: input.kind === "machine" ? null : (input.userId ?? null),
    label:
      input.label ??
      (input.kind === "machine"
        ? `Machine ${licenses.filter((item) => item.kind === "machine").length + 1}`
        : undefined),
  };
  persist([license, ...licenses]);
  return license;
}

export function removeUltraLicense(id: string) {
  hydrate();
  persist(licenses.filter((item) => item.id !== id));
}

export function machineUltraSeats(items: UltraLicense[] = licenses) {
  return items.filter((item) => item.kind === "machine");
}

export function userUltraSeats(items: UltraLicense[] = licenses) {
  return items.filter((item) => item.kind === "user");
}
