/**
 * Pure connector lifecycle decisions — testable without Supabase.
 */

import {
  MAX_CONNECTOR_ACCOUNTS_PER_CONNECTOR,
  canAddAnotherConnectorAccount,
} from "./account-names.ts";
import type { ConnectorConnectionRow } from "./mapper.ts";
import { isPendingExpired } from "./mapper.ts";

export type InitiateExistingDecision =
  | { action: "reuse"; reused: true }
  | { action: "conflict"; reason: "limit" | "duplicate_name" }
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

/**
 * Decide what to do when initiating against a single known live row.
 * Prefer reusing non-expired pending; active alone is not a hard conflict
 * when under the multi-account limit (caller must enforce count + name).
 */
export function resolveInitiateExisting(
  row: ConnectorConnectionRow | null,
  now = Date.now(),
): InitiateExistingDecision {
  if (!row) return { action: "insert" };
  if (row.status === "pending" && !isPendingExpired(row, now)) {
    return { action: "reuse", reused: true };
  }
  if (row.status === "active") {
    // Active rows no longer block adding another account — caller checks limit.
    return { action: "insert" };
  }
  return { action: "insert" };
}

export function isDisconnectIdempotent(status: string): boolean {
  return status === "disconnected";
}

/**
 * At most MAX live personal rows per (workspace, owner, connector).
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
  const liveCount = existing.filter((row) => {
    if (row.deletedAt) return false;
    if (!isLivePersonalStatus(row.status)) return false;
    return livePersonalConnectionKey(row) === key;
  }).length;
  return canAddAnotherConnectorAccount(liveCount);
}

/** Two users in one workspace may each hold live connections for the same connector. */
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

export { MAX_CONNECTOR_ACCOUNTS_PER_CONNECTOR };
