import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  canClaimOAuthState,
  isProcessingLeaseActive,
  shouldRecoverOAuthState,
  simulateClaim,
  validateCompletionBinding,
  type ConnectionSnapshot,
  type OAuthStateSnapshot,
} from "../lib/connectors/oauth-callback-logic.ts";

const OWNER_A = "11111111-1111-1111-1111-111111111111";
const OWNER_B = "22222222-2222-2222-2222-222222222222";
const NOW = Date.parse("2026-09-01T12:00:00.000Z");

function baseState(overrides: Partial<OAuthStateSnapshot> = {}): OAuthStateSnapshot {
  return {
    id: "oauth_test",
    connectionId: "conn_test",
    workspaceId: "ws-team",
    ownerId: OWNER_A,
    connectorId: "gmail",
    composioUserId: `cander:ws-team:${OWNER_A}`,
    linkSessionRef: "ca_link_ref",
    lifecycleStatus: "pending",
    expiresAt: new Date(NOW + 600_000).toISOString(),
    consumedAt: null,
    processingStartedAt: null,
    processingExpiresAt: null,
    verifiedProviderConnectionId: null,
    ...overrides,
  };
}

function baseConnection(overrides: Partial<ConnectionSnapshot> = {}): ConnectionSnapshot {
  return {
    id: "conn_test",
    workspaceId: "ws-team",
    ownerId: OWNER_A,
    connectorId: "gmail",
    status: "pending",
    providerConnectionId: null,
    composioUserId: null,
    ...overrides,
  };
}

test("two simultaneous claims: second caller blocked while lease active", () => {
  const states = [baseState()];
  const first = simulateClaim(states, OWNER_A, NOW);
  assert.equal(first.ok, true);
  const second = simulateClaim(states, OWNER_A, NOW);
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.reason, "processing");
});

test("expired processing lease allows reclaim", () => {
  const states = [
    baseState({
      lifecycleStatus: "processing",
      processingStartedAt: new Date(NOW - 180_000).toISOString(),
      processingExpiresAt: new Date(NOW - 1_000).toISOString(),
    }),
  ];
  assert.equal(isProcessingLeaseActive(states[0], NOW), false);
  const reclaimed = simulateClaim(states, OWNER_A, NOW);
  assert.equal(reclaimed.ok, true);
});

test("crash after Composio verification is recoverable when verified ref exists", () => {
  const state = baseState({
    lifecycleStatus: "processing",
    processingStartedAt: new Date(NOW - 130_000).toISOString(),
    processingExpiresAt: new Date(NOW - 10_000).toISOString(),
    verifiedProviderConnectionId: "ca_verified_123",
  });
  assert.equal(shouldRecoverOAuthState({ state, now: NOW }), true);
});

test("recovery skipped while processing lease still active without verified ref", () => {
  const state = baseState({
    lifecycleStatus: "processing",
    processingStartedAt: new Date(NOW - 30_000).toISOString(),
    processingExpiresAt: new Date(NOW + 90_000).toISOString(),
    verifiedProviderConnectionId: null,
  });
  assert.equal(shouldRecoverOAuthState({ state, now: NOW }), false);
});

test("retry after recoverable failure requires new authorization flow", () => {
  const claim = canClaimOAuthState({
    state: baseState({ lifecycleStatus: "failed" }),
    connection: baseConnection(),
    now: NOW,
  });
  assert.equal(claim.ok, false);
  if (!claim.ok) assert.equal(claim.reason, "failed");
});

test("completion binding rejects wrong composio user", () => {
  const result = validateCompletionBinding({
    state: baseState(),
    connection: baseConnection(),
    providerConnectionId: "ca_link_ref",
    composioUserId: "cander:other:user",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "composio_user_mismatch");
});

test("completion binding rejects wrong workspace on connection", () => {
  const result = validateCompletionBinding({
    state: baseState(),
    connection: baseConnection({ workspaceId: "ws-other" }),
    providerConnectionId: "ca_link_ref",
    composioUserId: `cander:ws-team:${OWNER_A}`,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "workspace_mismatch");
});

test("claim rejects wrong owner binding", () => {
  const result = canClaimOAuthState({
    state: baseState({ ownerId: OWNER_A }),
    connection: baseConnection({ ownerId: OWNER_B }),
    now: NOW,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "owner_mismatch");
});

test("migration 041 blocks active promotion via reconcile RPC", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/041_connector_oauth_resilience.sql"),
    "utf8",
  );
  assert.match(sql, /Pending activation must use complete_connector_oauth_callback/);
  assert.match(sql, /set search_path = pg_catalog, public/);
  assert.match(sql, /revoke all on function public\.reconcile_connector_connection/);
  assert.match(sql, /grant execute on function public\.complete_connector_oauth_callback/);
  assert.match(sql, /from public, anon, authenticated/);
});

test("webhook route cannot activate pending connections", () => {
  const src = readFileSync(
    join(process.cwd(), "app/api/connectors/webhooks/composio/route.ts"),
    "utf8",
  );
  assert.match(src, /connection\.status === "pending"/);
  assert.match(src, /ignored: true/);
  assert.doesNotMatch(src, /reconcileConnectionActive/);
});

test("lifecycle verify uses atomic oauth completion path", () => {
  const src = readFileSync(
    join(process.cwd(), "lib/connectors/lifecycle.ts"),
    "utf8",
  );
  assert.match(src, /claimOAuthStateForCallback/);
  assert.match(src, /recordOAuthVerification/);
  assert.match(src, /completeOAuthCallbackAtomic/);
  assert.doesNotMatch(src, /reconcileConnectionActive/);
  assert.doesNotMatch(src, /consumeOAuthStateById/);
});

test("simulated DB failure after Composio success leaves recoverable verified ref", () => {
  const states = [baseState()];
  const claimed = simulateClaim(states, OWNER_A, NOW);
  assert.equal(claimed.ok, true);
  if (!claimed.ok) return;

  // Composio complete_auth succeeded; Cander recorded verified ref then crashed.
  states[0].verifiedProviderConnectionId = "ca_link_ref";
  states[0].processingExpiresAt = new Date(NOW - 5_000).toISOString();

  assert.equal(shouldRecoverOAuthState({ state: states[0], now: NOW }), true);

  const binding = validateCompletionBinding({
    state: states[0],
    connection: baseConnection(),
    providerConnectionId: "ca_link_ref",
    composioUserId: `cander:ws-team:${OWNER_A}`,
  });
  assert.equal(binding.ok, true);
});

test("duplicate completion is idempotent when connection already active", () => {
  const claim = canClaimOAuthState({
    state: baseState(),
    connection: baseConnection({
      status: "active",
      providerConnectionId: "ca_link_ref",
    }),
    now: NOW,
  });
  assert.equal(claim.ok, true);
});
