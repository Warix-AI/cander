type Listener = () => void;

const STORAGE_KEY = "courier-work-connectors";
const INTENT_KEY = "courier-work-attach-intent";
const listeners = new Set<Listener>();

/** Default Work stack per workspace — overlaps in the chip. */
const defaults: Record<string, string[]> = {
  marketing: ["gmail", "slack", "gcal"],
  engineering: ["github", "slack", "gcal"],
  operations: ["gmail", "slack", "stripe"],
};

let byWorkspace: Record<string, string[]> = {};
let hydrated = false;

function emit() {
  listeners.forEach((listener) => listener());
}

function parse(raw: string | null): Record<string, string[]> {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return {};
    const next: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(data)) {
      if (!Array.isArray(value)) continue;
      next[key] = value.filter((item): item is string => typeof item === "string");
    }
    return next;
  } catch {
    return {};
  }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  byWorkspace = parse(window.localStorage.getItem(STORAGE_KEY));
}

function persist() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(byWorkspace));
  emit();
}

export function subscribeWorkConnectors(listener: Listener) {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getWorkConnectorsSnapshot() {
  return byWorkspace;
}

const EMPTY_WORK_CONNECTORS: Record<string, string[]> = {};

export function getWorkConnectorsServerSnapshot() {
  return EMPTY_WORK_CONNECTORS;
}

export function workConnectorIds(workspaceId: string): string[] {
  hydrate();
  if (byWorkspace[workspaceId]?.length) return byWorkspace[workspaceId];
  return defaults[workspaceId] ?? ["gmail", "slack", "gcal"];
}

export function isWorkConnector(workspaceId: string, connectorId: string) {
  return workConnectorIds(workspaceId).includes(connectorId);
}

export function attachWorkConnector(workspaceId: string, connectorId: string) {
  hydrate();
  const current = workConnectorIds(workspaceId);
  if (current.includes(connectorId)) return;
  byWorkspace = {
    ...byWorkspace,
    [workspaceId]: [connectorId, ...current],
  };
  persist();
}

export function detachWorkConnector(workspaceId: string, connectorId: string) {
  hydrate();
  const current = workConnectorIds(workspaceId);
  byWorkspace = {
    ...byWorkspace,
    [workspaceId]: current.filter((id) => id !== connectorId),
  };
  persist();
}

/** Arm Connectors so the next install attaches to Work. */
export function armWorkConnectorAttach(workspaceId: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(INTENT_KEY, workspaceId);
}

export function peekWorkConnectorAttach(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(INTENT_KEY);
}

export function consumeWorkConnectorAttach(): string | null {
  if (typeof window === "undefined") return null;
  const id = window.sessionStorage.getItem(INTENT_KEY);
  if (id) window.sessionStorage.removeItem(INTENT_KEY);
  return id;
}

export function clearWorkConnectorAttach() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(INTENT_KEY);
}
