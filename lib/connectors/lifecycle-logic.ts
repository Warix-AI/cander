/**
 * Pure connector lifecycle decisions — testable without Supabase.
 */

import type { ConnectorConnectionRow } from "./mapper.ts";
import { isPendingExpired } from "./mapper.ts";

export type InitiateExistingDecision =
  | { action: "reuse"; reused: true }
  | { action: "conflict" }
  | { action: "insert" };

/** v1 live personal connection scope key. */
export function livePersonalConnectionKey(input: {
  workspaceId: string;
  ownerId: string;
  connectorId: string;
}): string {
  return `${input.workspaceId}:${input.ownerId}:${input.connectorId}`;
}

export function isLivePersonalStatus(status: string): boolean {
  return status === "pending" || status === "active";
}

export function resolveInitiateExisting(
  row: ConnectorConnectionRow | null,
  now = Date.now(),
): InitiateExistingDecision {
  if (!row) return { action: "insert" };
  if (row.status === "pending" && !isPendingExpired(row, now)) {
    return { action: "reuse", reused: true };
  }
  if (row.status === "active") {
    return { action: "conflict" };
  }
  return { action: "insert" };
}

export function isDisconnectIdempotent(status: string): boolean {
  return status === "disconnected";
}

/**
 * Simulates DB partial unique index: at most one live personal row per key.
 * Returns false when a second live row for the same key would violate v1 rules.
 */
export function canAddLivePersonalConnection(
  existing: Array<{
    workspaceId: string;
    ownerId: string;
    connectorId: string;
    status: string;
    deletedAt?: string | null;
  }>,
  candidate: {
    workspaceId: string;
    ownerId: string;
    connectorId: string;
    status: string;
  },
): boolean {
  const key = livePersonalConnectionKey(candidate);
  if (!isLivePersonalStatus(candidate.status)) return true;
  const conflict = existing.some((row) => {
    if (row.deletedAt) return false;
    if (!isLivePersonalStatus(row.status)) return false;
    return livePersonalConnectionKey(row) === key;
  });
  return !conflict;
}

/** Two users in one workspace may each hold a live connection for the same connector. */
export function twoUsersSameConnectorAllowed(
  ownerA: string,
  ownerB: string,
  workspaceId: string,
  connectorId: string,
): boolean {
  const rows = [
    {
      workspaceId,
      ownerId: ownerA,
      connectorId,
      status: "pending",
    },
    {
      workspaceId,
      ownerId: ownerB,
      connectorId,
      status: "active",
    },
  ];
  return rows.every((row, index) =>
    canAddLivePersonalConnection(rows.slice(0, index), row),
  );
}

/** Legacy client/DB mock statuses must not surface as UI-connected. */
export function legacyAccountShowsAsLive(status: string): boolean {
  return status === "active";
}
