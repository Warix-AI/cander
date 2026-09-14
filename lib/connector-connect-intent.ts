/**
 * Session store: open an app's Apps detail screen from the sidebar More list
 * (same catalog modal as an app card — no auto name-account prompt).
 *
 * Also supports returning to the Apps catalog home (clears any open detail).
 */

type Listener = () => void;

export type ConnectorConnectIntent = {
  connectorId: string;
  /** Bumped each request so the same app can be re-requested. */
  nonce: number;
};

export type ConnectorsCatalogIntent = {
  /** Bumped each request so catalog home can be re-requested. */
  nonce: number;
};

let intent: ConnectorConnectIntent | null = null;
let catalogIntent: ConnectorsCatalogIntent | null = null;
let nonce = 0;
let catalogNonce = 0;
const listeners = new Set<Listener>();
const catalogListeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
}

function emitCatalog() {
  catalogListeners.forEach((listener) => listener());
}

export function subscribeConnectorConnectIntent(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getConnectorConnectIntentSnapshot() {
  return intent;
}

export function getConnectorConnectIntentServerSnapshot(): ConnectorConnectIntent | null {
  return null;
}

/** Request Apps catalog to open this app's detail screen. */
export function requestConnectorConnect(connectorId: string) {
  const id = connectorId.trim();
  if (!id) return;
  nonce += 1;
  intent = { connectorId: id, nonce };
  emit();
}

/** Clear after the catalog consumes the request (optional). */
export function clearConnectorConnectIntent() {
  if (!intent) return;
  intent = null;
  emit();
}

export function subscribeConnectorsCatalogIntent(listener: Listener) {
  catalogListeners.add(listener);
  return () => catalogListeners.delete(listener);
}

export function getConnectorsCatalogIntentSnapshot() {
  return catalogIntent;
}

export function getConnectorsCatalogIntentServerSnapshot(): ConnectorsCatalogIntent | null {
  return null;
}

/** Open the Apps catalog list (not a specific app detail / sidebar + App). */
export function requestConnectorsCatalog() {
  catalogNonce += 1;
  catalogIntent = { nonce: catalogNonce };
  if (intent) {
    intent = null;
    emit();
  }
  emitCatalog();
}
