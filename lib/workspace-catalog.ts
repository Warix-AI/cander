import { NAV_SPACES } from "./spaces";
import type { Workspace, WorkspaceKind } from "./types";
import { workspaceKindOf } from "./workspace-kind";

type Listener = () => void;

const STORAGE_KEY = "courier-custom-workspaces";
const listeners = new Set<Listener>();
let custom: Workspace[] = [];
let catalog: Workspace[] = [];
let hydrated = false;

function emit() {
  listeners.forEach((listener) => listener());
}

function rebuildCatalog() {
  const byId = new Map<string, Workspace>();
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
  custom = parse(window.localStorage.getItem(STORAGE_KEY)).filter(
    (item) =>
      !["marketing", "engineering", "operations", "solo-pro", "solo-ultra", "solo-free"].includes(
        item.id,
      ),
  );
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
  if (!hydrated && typeof window !== "undefined") hydrate();
  return catalog;
}

const EMPTY_CATALOG: Workspace[] = [];

export function getWorkspaceCatalogServerSnapshot(): Workspace[] {
  return EMPTY_CATALOG;
}

export function mergeCatalog(extra: Workspace[] = custom): Workspace[] {
  const byId = new Map<string, Workspace>();
  for (const item of extra) byId.set(item.id, item);
  return Array.from(byId.values());
}

export function workspaceById(
  id: string,
  list: Workspace[] = getWorkspaceCatalogSnapshot(),
) {
  return list.find((item) => item.id === id) ?? list[0];
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

/** Merge a remote (Supabase) workspace into the local catalog. */
export function upsertCatalogWorkspace(workspace: Workspace) {
  hydrate();
  const next: Workspace = {
    ...workspace,
    spaces: workspace.spaces?.length ? [...workspace.spaces] : [...NAV_SPACES],
  };
  const index = custom.findIndex((item) => item.id === next.id);
  if (index >= 0) {
    custom = custom.map((item, i) => (i === index ? { ...item, ...next } : item));
  } else {
    custom = [...custom, next];
  }
  persist();
  return next;
}

/** @deprecated Prefer createWorkspace({ kind }) — kept for older call sites. */
export function spacesForNewWorkspace(opts?: {
  includeWork?: boolean;
}): Workspace["spaces"] {
  const includeWork = opts?.includeWork !== false;
  return NAV_SPACES.filter((id) => {
    if (id === "work") return includeWork;
    return true;
  });
}

export function listCustomWorkspaces() {
  hydrate();
  return custom;
}

/** @deprecated Seeds removed — always false. */
export function isSeedWorkspace(_id: string) {
  return false;
}

/** Workspaces created in-session or hydrated from Supabase — safe to delete. */
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

/** Drop legacy Acme catalog ids from localStorage (one-shot hygiene). */
export function clearLegacySeedWorkspacesFromStorage() {
  if (typeof window === "undefined") return;
  hydrate();
  const before = custom.length;
  custom = custom.filter(
    (item) =>
      !["marketing", "engineering", "operations", "solo-pro", "solo-ultra", "solo-free"].includes(
        item.id,
      ),
  );
  if (custom.length !== before) persist();
}
