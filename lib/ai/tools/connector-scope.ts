/**
 * Resolve composer/agent connector chip scope — fail closed.
 * Selected connection IDs that do not resolve to the caller's active
 * connections must not broaden access to all of that user's connectors.
 */

export type ScopedConnectionRef = {
  connectionId: string;
  connectorId: string;
};

export type ConnectorScopeResolution = {
  /** Client asked to scope to one or more connection ids. */
  scopeRequested: boolean;
  /** Active connections owned by the caller that matched the request. */
  scopedConnections: ScopedConnectionRef[];
  /** Connector ids derived from resolved scoped connections. */
  preferConnectorIds: string[];
  /**
   * True when scope was requested but none of the ids resolved.
   * Callers must expose zero connector tools (never fall open).
   */
  failClosed: boolean;
};

export function resolveConnectorScope(input: {
  selectedConnectionIds?: string[] | null;
  selectedConnectionId?: string | null;
  activeConnections: ScopedConnectionRef[];
}): ConnectorScopeResolution {
  const scopedConnectionIds = [
    ...(input.selectedConnectionIds ?? []),
    ...(input.selectedConnectionId ? [input.selectedConnectionId] : []),
  ]
    .map((id) => id.trim())
    .filter((id, i, arr) => Boolean(id) && arr.indexOf(id) === i);

  const scopeRequested = scopedConnectionIds.length > 0;
  if (!scopeRequested) {
    return {
      scopeRequested: false,
      scopedConnections: [],
      preferConnectorIds: [],
      failClosed: false,
    };
  }

  const allowed = new Set(scopedConnectionIds);
  const scopedConnections = input.activeConnections.filter((c) =>
    allowed.has(c.connectionId),
  );
  const preferConnectorIds = [
    ...new Set(scopedConnections.map((c) => c.connectorId)),
  ];

  return {
    scopeRequested: true,
    scopedConnections,
    preferConnectorIds,
    failClosed: scopedConnections.length === 0,
  };
}
