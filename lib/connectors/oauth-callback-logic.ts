/**
 * Pure OAuth callback lifecycle logic — unit-testable without a database.
 */

export type OAuthLifecycleStatus = "pending" | "processing" | "consumed" | "failed";

export type OAuthStateSnapshot = {
  id: string;
  connectionId: string;
  workspaceId: string;
  ownerId: string;
  connectorId: string;
  composioUserId: string;
  linkSessionRef: string | null;
  lifecycleStatus: OAuthLifecycleStatus;
  expiresAt: string;
  consumedAt: string | null;
  processingStartedAt: string | null;
  processingExpiresAt: string | null;
  verifiedProviderConnectionId: string | null;
};

export type ConnectionSnapshot = {
  id: string;
  workspaceId: string;
  ownerId: string;
  connectorId: string;
  status: "pending" | "active" | "failed" | "disconnected";
  providerConnectionId: string | null;
  composioUserId: string | null;
};

export function isOAuthStateExpired(
  state: Pick<OAuthStateSnapshot, "expiresAt">,
  now = Date.now(),
): boolean {
  return Date.parse(state.expiresAt) <= now;
}

export function isProcessingLeaseActive(
  state: Pick<OAuthStateSnapshot, "processingExpiresAt">,
  now = Date.now(),
): boolean {
  if (!state.processingExpiresAt) return false;
  return Date.parse(state.processingExpiresAt) > now;
}

export function canClaimOAuthState(input: {
  state: OAuthStateSnapshot;
  connection: ConnectionSnapshot;
  now?: number;
}): { ok: true } | { ok: false; reason: string } {
  const now = input.now ?? Date.now();
  if (isOAuthStateExpired(input.state, now)) {
    return { ok: false, reason: "expired" };
  }
  if (input.state.lifecycleStatus === "consumed" || input.state.consumedAt) {
    return { ok: false, reason: "consumed" };
  }
  if (input.state.lifecycleStatus === "failed") {
    return { ok: false, reason: "failed" };
  }
  if (
    input.state.lifecycleStatus === "processing" &&
    isProcessingLeaseActive(input.state, now)
  ) {
    return { ok: false, reason: "processing" };
  }
  if (input.state.ownerId !== input.connection.ownerId) {
    return { ok: false, reason: "owner_mismatch" };
  }
  if (input.state.workspaceId !== input.connection.workspaceId) {
    return { ok: false, reason: "workspace_mismatch" };
  }
  if (input.state.connectorId !== input.connection.connectorId) {
    return { ok: false, reason: "connector_mismatch" };
  }
  if (input.state.connectionId !== input.connection.id) {
    return { ok: false, reason: "connection_mismatch" };
  }
  if (
    input.connection.status === "active" &&
    input.connection.providerConnectionId
  ) {
    return { ok: true };
  }
  if (input.connection.status !== "pending") {
    return { ok: false, reason: "connection_not_pending" };
  }
  return { ok: true };
}

export function validateCompletionBinding(input: {
  state: OAuthStateSnapshot;
  connection: ConnectionSnapshot;
  providerConnectionId: string;
  composioUserId: string;
}): { ok: true } | { ok: false; reason: string } {
  if (input.state.composioUserId !== input.composioUserId) {
    return { ok: false, reason: "composio_user_mismatch" };
  }
  if (
    input.state.linkSessionRef &&
    input.state.linkSessionRef !== input.providerConnectionId
  ) {
    return { ok: false, reason: "link_session_mismatch" };
  }
  if (
    input.state.verifiedProviderConnectionId &&
    input.state.verifiedProviderConnectionId !== input.providerConnectionId
  ) {
    return { ok: false, reason: "verified_provider_mismatch" };
  }
  if (input.state.connectionId !== input.connection.id) {
    return { ok: false, reason: "connection_mismatch" };
  }
  if (input.state.workspaceId !== input.connection.workspaceId) {
    return { ok: false, reason: "workspace_mismatch" };
  }
  if (input.state.ownerId !== input.connection.ownerId) {
    return { ok: false, reason: "owner_mismatch" };
  }
  if (
    input.connection.composioUserId &&
    input.connection.composioUserId !== input.composioUserId
  ) {
    return { ok: false, reason: "connection_composio_user_mismatch" };
  }
  return { ok: true };
}

export function shouldRecoverOAuthState(input: {
  state: OAuthStateSnapshot;
  now?: number;
}): boolean {
  const now = input.now ?? Date.now();
  if (isOAuthStateExpired(input.state, now)) return false;
  if (input.state.lifecycleStatus !== "processing") return false;
  if (input.state.consumedAt) return false;
  if (input.state.verifiedProviderConnectionId) return true;
  return !isProcessingLeaseActive(input.state, now);
}

export function simulateClaim(
  states: OAuthStateSnapshot[],
  ownerId: string,
  now = Date.now(),
): { ok: true; state: OAuthStateSnapshot } | { ok: false; reason: string } {
  const candidate = states
    .filter(
      (s) =>
        s.ownerId === ownerId &&
        !s.consumedAt &&
        s.lifecycleStatus !== "failed" &&
        !isOAuthStateExpired(s, now),
    )
    .sort((a, b) => Date.parse(b.expiresAt) - Date.parse(a.expiresAt))[0];
  if (!candidate) return { ok: false, reason: "not_found" };
  if (
    candidate.lifecycleStatus === "processing" &&
    isProcessingLeaseActive(candidate, now)
  ) {
    return { ok: false, reason: "processing" };
  }
  candidate.lifecycleStatus = "processing";
  candidate.processingStartedAt = new Date(now).toISOString();
  candidate.processingExpiresAt = new Date(now + 120_000).toISOString();
  return { ok: true, state: candidate };
}
