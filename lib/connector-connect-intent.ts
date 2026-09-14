/**
 * Session store: open an app's existing Connect / Add Account UI from the
 * sidebar (or elsewhere) without a parallel connection flow.
 */

type Listener = () => void;

export type ConnectorConnectIntent = {
  connectorId: string;
  /** Bumped each request so the same app can be re-requested. */
  nonce: number;
};

let intent: ConnectorConnectIntent | null = null;
let nonce = 0;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
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

/** Request Apps catalog to open this app in Connect / Add Account. */
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
