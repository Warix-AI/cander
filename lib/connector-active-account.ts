/**
 * Session preference: which connector account is active for a given
 * workspace + connector (mobile header switcher + panel views).
 */

type Listener = () => void;

const listeners = new Set<Listener>();
/** key = `${workspaceId}:${connectorId}` → connectionId */
const activeByKey = new Map<string, string>();

function keyFor(workspaceId: string, connectorId: string) {
  return `${workspaceId}:${connectorId}`;
}

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeConnectorActiveAccount(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getConnectorActiveAccountSnapshot() {
  return activeByKey;
}

export function getConnectorActiveAccountServerSnapshot() {
  return activeByKey;
}

export function getActiveConnectorAccountId(
  workspaceId: string,
  connectorId: string,
): string | null {
  return activeByKey.get(keyFor(workspaceId, connectorId)) ?? null;
}

export function setActiveConnectorAccountId(
  workspaceId: string,
  connectorId: string,
  connectionId: string | null,
) {
  const key = keyFor(workspaceId, connectorId);
  const prev = activeByKey.get(key) ?? null;
  const next = connectionId?.trim() || null;
  if (prev === next) return;
  if (!next) activeByKey.delete(key);
  else activeByKey.set(key, next);
  emit();
}

/** Prefer stored id when it still exists in `accounts`; else first account. */
export function resolveActiveConnectorAccount<
  T extends { id: string; status: string },
>(
  workspaceId: string,
  connectorId: string,
  accounts: T[],
  isActive: (status: string) => boolean = (status) => status === "active",
): T | null {
  const live = accounts.filter((row) => isActive(row.status));
  if (!live.length) return null;
  const preferred = getActiveConnectorAccountId(workspaceId, connectorId);
  if (preferred) {
    const match = live.find((row) => row.id === preferred);
    if (match) return match;
  }
  return live[0] ?? null;
}
