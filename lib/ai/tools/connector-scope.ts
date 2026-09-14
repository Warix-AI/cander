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

/**
 * When the user names an account label in chat (e.g. after we asked which
 * Gmail), bind that label to a connection id. Requires a unique match.
 */
export function matchConnectionFromUserText(input: {
  text: string;
  candidates: Array<{ connectionId: string; label: string }>;
}): string | null {
  const text = input.text.trim().toLowerCase();
  if (!text || input.candidates.length < 2) return null;

  const hits = input.candidates.filter((candidate) => {
    const label = candidate.label.trim().toLowerCase();
    if (label.length < 2) return false;
    if (text === label) return true;
    // Word-boundary-ish: avoid matching "work" inside "network".
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
    return re.test(text);
  });

  if (hits.length !== 1) return null;
  return hits[0]!.connectionId;
}

/** Human-readable ask when multiple accounts are connected for one app. */
export function formatAccountAmbiguousQuestion(input: {
  connectorLabel: string;
  candidates: Array<{ label: string }>;
}): string {
  const names = input.candidates
    .map((row) => row.label.trim())
    .filter(Boolean);
  const listed =
    names.length > 0
      ? names.map((name) => `"${name}"`).join(", ")
      : "more than one";
  return `You have multiple ${input.connectorLabel} accounts connected (${listed}). Which account should I use?`;
}
