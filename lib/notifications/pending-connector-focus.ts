/**
 * Pending connector resource focus from notification taps (all clients).
 */

type PendingFocus = {
  connectorId: string;
  connectionId?: string;
  messageId?: string;
  threadId?: string;
  at: number;
};

let pending: PendingFocus | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function setPendingConnectorFocus(focus: Omit<PendingFocus, "at">) {
  pending = { ...focus, at: Date.now() };
  emit();
}

export function consumePendingConnectorFocus(
  connectorId: string,
): PendingFocus | null {
  if (!pending || pending.connectorId !== connectorId) return null;
  // Expire after 2 minutes
  if (Date.now() - pending.at > 120_000) {
    pending = null;
    return null;
  }
  const out = pending;
  pending = null;
  emit();
  return out;
}

export function peekPendingConnectorFocus(): PendingFocus | null {
  return pending;
}

export function subscribePendingConnectorFocus(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True when the user is already viewing this exact resource (suppress OS toast). */
export function isViewingConnectorResource(opts: {
  connectorId: string | null | undefined;
  connectionId?: string | null;
  messageId?: string | null;
  threadId?: string | null;
  activeConnectorId?: string | null;
  activeConnectionId?: string | null;
  activeMessageId?: string | null;
}): boolean {
  if (!opts.connectorId || opts.activeConnectorId !== opts.connectorId) {
    return false;
  }
  if (
    opts.connectionId &&
    opts.activeConnectionId &&
    opts.connectionId !== opts.activeConnectionId
  ) {
    return false;
  }
  if (opts.messageId && opts.activeMessageId === opts.messageId) return true;
  if (opts.threadId && opts.activeMessageId && opts.threadId) {
    // Soft match: same connection + connector while message open is enough for suppress.
    return Boolean(opts.activeConnectionId);
  }
  return false;
}
