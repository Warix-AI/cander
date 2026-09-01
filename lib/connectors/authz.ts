/**
 * Pure connector authorization helpers — no I/O.
 * Same safe response for missing connection and wrong owner (no enumeration).
 */

export function connectionNotFoundError() {
  return { status: 404 as const, error: "Connection not found." };
}

export function workspaceAccessDeniedError() {
  return { status: 403 as const, error: "Workspace access denied." };
}

export function unauthorizedError() {
  return { status: 401 as const, error: "Unauthorized." };
}

export function invalidPayloadError() {
  return { status: 400 as const, error: "Invalid payload." };
}

export function conflictError(message = "Connection already exists.") {
  return { status: 409 as const, error: message };
}

/** Owner check for in-memory / test assertions. */
export function assertConnectionOwner(input: {
  ownerId: string;
  actorId: string;
}): { ok: true } | { ok: false; status: 404; error: string } {
  if (input.ownerId !== input.actorId) {
    return { ok: false, ...connectionNotFoundError() };
  }
  return { ok: true };
}

/** Workspace membership required before any connection query. */
export function assertWorkspaceMember(input: {
  isMember: boolean;
}): { ok: true } | { ok: false; status: 403; error: string } {
  if (!input.isMember) {
    return { ok: false, ...workspaceAccessDeniedError() };
  }
  return { ok: true };
}

/** Map legacy mock status to non-live — never treat as active. */
export function legacyStatusToLiveConnection(
  _status: string,
): ConnectorConnectionStatusNeverActive {
  return "never_live";
}

export type ConnectorConnectionStatusNeverActive = "never_live";

export function isLiveConnectionStatus(
  status: string,
): status is "pending" | "active" {
  return status === "pending" || status === "active";
}

/** UI must only show connected for server active status. */
export function isUiConnectedStatus(status: string): boolean {
  return status === "active";
}
