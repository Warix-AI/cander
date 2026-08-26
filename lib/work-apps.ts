type Listener = () => void;

const STORAGE_KEY = "courier-work-apps";
const listeners = new Set<Listener>();

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

export function subscribeWorkApps(listener: Listener) {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getWorkAppsSnapshot() {
  return byWorkspace;
}

const EMPTY_WORK_APPS: Record<string, string[]> = {};

export function getWorkAppsServerSnapshot() {
  return EMPTY_WORK_APPS;
}

export function workAppIds(workspaceId: string): string[] {
  hydrate();
  return byWorkspace[workspaceId] ?? [];
}

export function isWorkApp(workspaceId: string, projectId: string) {
  return workAppIds(workspaceId).includes(projectId);
}

export function attachWorkApp(workspaceId: string, projectId: string) {
  hydrate();
  const current = workAppIds(workspaceId);
  if (current.includes(projectId)) return;
  byWorkspace = {
    ...byWorkspace,
    [workspaceId]: [projectId, ...current],
  };
  persist();
}

export function detachWorkApp(workspaceId: string, projectId: string) {
  hydrate();
  const current = workAppIds(workspaceId);
  byWorkspace = {
    ...byWorkspace,
    [workspaceId]: current.filter((id) => id !== projectId),
  };
  persist();
}
