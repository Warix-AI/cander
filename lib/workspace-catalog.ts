import { workspaces as seedWorkspaces } from "./data";
import { NAV_SPACES } from "./spaces";
import type { Workspace, WorkspaceKind } from "./types";
import { workspaceKindOf } from "./workspace-kind";

type Listener = () => void;

const STORAGE_KEY = "courier-custom-workspaces";
const listeners = new Set<Listener>();
let custom: Workspace[] = [];
let catalog: Workspace[] = seedWorkspaces;
let hydrated = false;

function emit() {
  listeners.forEach((listener) => listener());
}

function rebuildCatalog() {
  const byId = new Map<string, Workspace>();
  for (const item of seedWorkspaces) byId.set(item.id, item);
  for (const item of custom) byId.set(item.id, item);
  catalog = Array.from(byId.values());
}

function normalizeWorkspace(row: Record<string, unknown>): Workspace | null {
  const id = String(row.id ?? "").trim();
  const name = String(row.name ?? "").trim();
  if (!id || !name) return null;
  const kindRaw = row.kind;
  const kind: WorkspaceKind | undefined =
    kindRaw === "personal" || kindRaw === "business"
      ? kindRaw
      : row.personal === true
        ? "personal"
        : undefined;
  const personal = kind === "personal" || row.personal === true;
  return {
    id,
    name,
    spaces: Array.isArray(row.spaces)
      ? (row.spaces.map(String) as Workspace["spaces"])
      : [...NAV_SPACES],
    members: typeof row.members === "number" ? row.members : 1,
    budget: typeof row.budget === "string" ? row.budget : "$0",
    spend: typeof row.spend === "string" ? row.spend : "$0",
    ...(personal ? { personal: true } : {}),
    ...(kind ? { kind } : {}),
  };
}

function parse(raw: string | null): Workspace[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    const next: Workspace[] = [];
    for (const item of data) {
      if (!item || typeof item !== "object") continue;
      const row = normalizeWorkspace(item as Record<string, unknown>);
      if (row) next.push(row);
    }
    return next;
  } catch {
    return [];
  }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  custom = parse(window.localStorage.getItem(STORAGE_KEY));
  rebuildCatalog();
}

function persist() {
  rebuildCatalog();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  emit();
}

export function subscribeWorkspaceCatalog(listener: Listener) {
  listeners.add(listener);
  if (typeof window !== "undefined" && !hydrated) {
    queueMicrotask(() => {
      hydrate();
      emit();
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

export function getWorkspaceCatalogSnapshot(): Workspace[] {
  if (!hydrated) return seedWorkspaces;
  return catalog;
}

export function getWorkspaceCatalogServerSnapshot(): Workspace[] {
  return seedWorkspaces;
}

export function mergeCatalog(extra: Workspace[] = custom): Workspace[] {
  const byId = new Map<string, Workspace>();
  for (const item of seedWorkspaces) byId.set(item.id, item);
  for (const item of extra) byId.set(item.id, item);
  return Array.from(byId.values());
}

export function workspaceById(
  id: string,
  list: Workspace[] = getWorkspaceCatalogSnapshot(),
) {
  return list.find((item) => item.id === id) ?? list[0] ?? seedWorkspaces[0]!;
}

export function slugifyWorkspaceName(name: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "workspace";
}

export function uniqueWorkspaceId(name: string, existing: Workspace[]) {
  const base = slugifyWorkspaceName(name);
  if (!existing.some((item) => item.id === base)) return base;
  let n = 2;
  while (existing.some((item) => item.id === `${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function createWorkspace(input: {
  name: string;
  kind: WorkspaceKind;
  spaces?: Workspace["spaces"];
}): Workspace | null {
  hydrate();
  const name = input.name.trim();
  if (!name) return null;
  const id = uniqueWorkspaceId(name, catalog);
  const spaces = input.spaces ? [...input.spaces] : [...NAV_SPACES];
  const kind = input.kind;
  const next: Workspace = {
    id,
    name,
    spaces,
    members: 1,
    budget: "$0",
    spend: "$0",
    kind,
    ...(kind === "personal" ? { personal: true } : {}),
  };
  custom = [...custom, next];
  persist();
  return next;
}

/** @deprecated Prefer createWorkspace({ kind }) — kept for older call sites. */
export function spacesForNewWorkspace(opts?: {
  includeWork?: boolean;
  includePersonal?: boolean;
}): Workspace["spaces"] {
  const includeWork = opts?.includeWork !== false;
  const includePersonal = opts?.includePersonal !== false;
  return NAV_SPACES.filter((id) => {
    if (id === "work") return includeWork;
    if (id === "personal") return includePersonal;
    return true;
  });
}

export function listCustomWorkspaces() {
  hydrate();
  return custom;
}

export function isSeedWorkspace(id: string) {
  return seedWorkspaces.some((item) => item.id === id);
}

/** Workspaces created in-session — safe to delete. Demo seed workspaces are not. */
export function isCustomWorkspace(id: string) {
  hydrate();
  return custom.some((item) => item.id === id);
}

export function deleteWorkspace(id: string): boolean {
  hydrate();
  if (!isCustomWorkspace(id)) return false;
  custom = custom.filter((item) => item.id !== id);
  persist();
  return true;
}

export function countWorkspacesByKind(kind: WorkspaceKind) {
  return getWorkspaceCatalogSnapshot().filter(
    (item) => workspaceKindOf(item) === kind,
  ).length;
}
