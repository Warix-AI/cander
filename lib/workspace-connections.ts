import { connectors as seed } from "./data";
import type { ConnectorAccount, Workspace, WorkspaceKind } from "./types";
import { workspaceKindOf } from "./workspace-kind";

type Listener = () => void;

const STORAGE_KEY = "courier-workspace-connections";
const listeners = new Set<Listener>();

/** Per workspace → connector id → connected accounts (multiple allowed). */
type Store = Record<string, Record<string, ConnectorAccount[]>>;

let byWorkspace: Store = {};
let hydrated = false;
let revision = 0;

function emit() {
  listeners.forEach((listener) => listener());
}

function parse(raw: string | null): Store {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return {};
    const next: Store = {};
    for (const [ws, connectors] of Object.entries(data)) {
      if (!connectors || typeof connectors !== "object") continue;
      const map: Record<string, ConnectorAccount[]> = {};
      for (const [cid, accounts] of Object.entries(
        connectors as Record<string, unknown>,
      )) {
        if (!Array.isArray(accounts)) continue;
        map[cid] = accounts.filter(isAccount);
      }
      next[ws] = map;
    }
    return next;
  } catch {
    return {};
  }
}

function isAccount(value: unknown): value is ConnectorAccount {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.label === "string" &&
    (row.status === "connected" ||
      row.status === "needs-reauth" ||
      row.status === "error")
  );
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  byWorkspace = parse(window.localStorage.getItem(STORAGE_KEY));
}

function persist() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(byWorkspace));
  revision += 1;
  emit();
}

/** Replace workspace connections (Supabase hydrate). */
export function replaceWorkspaceConnectionsState(next: Store) {
  byWorkspace = next;
  hydrated = true;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(byWorkspace));
  }
  revision += 1;
  emit();
}

export function getWorkspaceConnectionsRevision() {
  return revision;
}

export function subscribeWorkspaceConnections(listener: Listener) {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getWorkspaceConnectionsSnapshot() {
  return byWorkspace;
}

const EMPTY_CONNECTIONS: Store = {};

export function getWorkspaceConnectionsServerSnapshot(): Store {
  return EMPTY_CONNECTIONS;
}

function clone(account: ConnectorAccount): ConnectorAccount {
  return { ...account };
}

/** Seed labels differ for personal vs business workspaces. */
function seedAccounts(
  connectorId: string,
  kind: WorkspaceKind,
): ConnectorAccount[] {
  const item = seed.find((c) => c.id === connectorId);
  if (!item) return [];

  if (kind === "personal") {
    const personal: Record<string, ConnectorAccount[]> = {
      gmail: [{ id: "p-g1", label: "me@gmail.com", status: "connected" }],
      slack: [{ id: "p-sl1", label: "Personal Slack", status: "connected" }],
      github: [{ id: "p-gh1", label: "personal-handle", status: "connected" }],
      gcal: [{ id: "p-c1", label: "me@gmail.com", status: "connected" }],
      "local-files": [{ id: "p-lf1", label: "This Mac", status: "connected" }],
      stash: [{ id: "p-st1", label: "Private stash", status: "connected" }],
    };
    if (personal[connectorId]) return personal[connectorId].map(clone);
    if (item.scope === "personal" && item.accounts.length) {
      return item.accounts.map(clone);
    }
    return item.installed && item.accounts.length
      ? [clone(item.accounts[0])]
      : [];
  }

  return item.accounts.map(clone);
}

function defaultMap(kind: WorkspaceKind): Record<string, ConnectorAccount[]> {
  const seeded: Record<string, ConnectorAccount[]> = {};
  for (const item of seed) {
    const accounts = seedAccounts(item.id, kind);
    if (accounts.length) seeded[item.id] = accounts;
  }
  return seeded;
}

function kindOf(workspace?: Workspace | null): WorkspaceKind {
  return workspace ? workspaceKindOf(workspace) : "business";
}

/** Read path — never writes. */
export function connectionsForWorkspace(
  workspaceId: string,
  workspace?: Workspace | null,
): Record<string, ConnectorAccount[]> {
  hydrate();
  if (byWorkspace[workspaceId]) return byWorkspace[workspaceId];
  return defaultMap(kindOf(workspace));
}

export function connectionsForConnector(
  workspaceId: string,
  connectorId: string,
  workspace?: Workspace | null,
): ConnectorAccount[] {
  return connectionsForWorkspace(workspaceId, workspace)[connectorId] ?? [];
}

export function connectedConnectorIds(
  workspaceId: string,
  workspace?: Workspace | null,
): string[] {
  const map = connectionsForWorkspace(workspaceId, workspace);
  return Object.keys(map).filter((id) => (map[id]?.length ?? 0) > 0);
}

function materialize(workspaceId: string, workspace?: Workspace | null) {
  hydrate();
  if (byWorkspace[workspaceId]) return { ...byWorkspace[workspaceId] };
  return defaultMap(kindOf(workspace));
}

export function addWorkspaceConnection(
  workspaceId: string,
  connectorId: string,
  label: string,
  workspace?: Workspace | null,
) {
  const map = materialize(workspaceId, workspace);
  const current = [...(map[connectorId] ?? [])];
  const id = `${connectorId}-${Date.now().toString(36)}`;
  current.push({
    id,
    label: label.trim() || "New connection",
    status: "connected",
  });
  map[connectorId] = current;
  byWorkspace = { ...byWorkspace, [workspaceId]: map };
  persist();
}

export function removeWorkspaceConnection(
  workspaceId: string,
  connectorId: string,
  accountId: string,
  workspace?: Workspace | null,
) {
  const map = materialize(workspaceId, workspace);
  const current = (map[connectorId] ?? []).filter((a) => a.id !== accountId);
  if (current.length) map[connectorId] = current;
  else delete map[connectorId];
  byWorkspace = { ...byWorkspace, [workspaceId]: map };
  persist();
}

export function clearWorkspaceConnections(workspaceId: string) {
  hydrate();
  if (!byWorkspace[workspaceId]) return;
  const next = { ...byWorkspace };
  delete next[workspaceId];
  byWorkspace = next;
  persist();
}

/** Catalog connectors relevant to this workspace kind. */
export function connectorsAvailableForKind(kind: WorkspaceKind) {
  const base =
    kind === "personal"
      ? seed.filter(
          (item) => item.scope === "public" || item.scope === "personal",
        )
      : seed.filter((item) => item.scope === "public");
  return base.filter(
    (item) => item.featured || item.installed || item.scope === "personal",
  );
}
