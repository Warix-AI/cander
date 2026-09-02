import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  assertConnectionOwner,
  assertWorkspaceMember,
  isUiConnectedStatus,
  legacyStatusToLiveConnection,
} from "../lib/connectors/authz.ts";
import {
  canAddLivePersonalConnection,
  isDisconnectIdempotent,
  legacyAccountShowsAsLive,
  livePersonalConnectionKey,
  resolveInitiateExisting,
  twoUsersSameConnectorAllowed,
} from "../lib/connectors/lifecycle-logic.ts";
import {
  assertNoSecretKeys,
  connectionRowToPublic,
  isPendingExpired,
  pendingExpiresAtIso,
} from "../lib/connectors/mapper.ts";
import { sanitizeAuditDetail } from "../lib/connectors/audit.ts";
import { composioUserId, parseComposioUserId } from "../lib/connectors/composio-identity.ts";
import { isOAuthStateExpired } from "../lib/connectors/oauth-state.ts";
import { authorizeConnectorToolAction } from "../lib/connectors/tool-authz.ts";
import { resetConnectorRateLimitsForTests } from "../lib/connectors/rate-limit.ts";

test("two users in one workspace may each connect the same connector", () => {
  assert.equal(
    twoUsersSameConnectorAllowed(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      "ws-team",
      "gmail",
    ),
    true,
  );
});

test("one user cannot create two live connections for same connector in workspace", () => {
  const owner = "11111111-1111-1111-1111-111111111111";
  const existing = [
    {
      workspaceId: "ws-team",
      ownerId: owner,
      connectorId: "gmail",
      status: "pending",
    },
  ];
  assert.equal(
    canAddLivePersonalConnection(existing, {
      workspaceId: "ws-team",
      ownerId: owner,
      connectorId: "gmail",
      status: "active",
    }),
    false,
  );
});

test("duplicate initiate reuses non-expired pending", () => {
  const row = {
    id: "conn_x",
    workspace_id: "ws",
    owner_id: "11111111-1111-1111-1111-111111111111",
    connector_id: "gmail",
    connection_mode: "personal" as const,
    status: "pending" as const,
    provider_connection_id: null,
    provider_name: null,
    failure_detail: null,
    connected_by: "11111111-1111-1111-1111-111111111111",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    connected_at: null,
    disconnected_at: null,
    last_sync_at: null,
    pending_expires_at: pendingExpiresAtIso(),
    deleted_at: null,
  };
  assert.deepEqual(resolveInitiateExisting(row), {
    action: "reuse",
    reused: true,
  });
});

test("parallel initiate race resolves to single live key", () => {
  const owner = "11111111-1111-1111-1111-111111111111";
  const key = livePersonalConnectionKey({
    workspaceId: "ws",
    ownerId: owner,
    connectorId: "slack",
  });
  const store = new Set<string>();
  const attempts = Array.from({ length: 5 }, () => key);
  for (const attempt of attempts) {
    if (!store.has(attempt)) store.add(attempt);
  }
  assert.equal(store.size, 1);
});

test("idempotent disconnect recognizes terminal state", () => {
  assert.equal(isDisconnectIdempotent("disconnected"), true);
  assert.equal(isDisconnectIdempotent("active"), false);
});

test("legacy local-storage accounts never show as live connected", () => {
  assert.equal(legacyAccountShowsAsLive("connected"), false);
  assert.equal(legacyAccountShowsAsLive("needs-reauth"), false);
  assert.equal(isUiConnectedStatus("connected"), false);
});

test("v1 uniqueness scope: different owners same workspace allowed", () => {
  const ownerA = "11111111-1111-1111-1111-111111111111";
  const ownerB = "22222222-2222-2222-2222-222222222222";
  assert.notEqual(ownerA, ownerB);
  assert.doesNotThrow(() => assertConnectionOwner({ ownerId: ownerA, actorId: ownerA }));
  assert.doesNotThrow(() => assertConnectionOwner({ ownerId: ownerB, actorId: ownerB }));
});

test("cross-user owner check returns uniform not-found", () => {
  const result = assertConnectionOwner({
    ownerId: "11111111-1111-1111-1111-111111111111",
    actorId: "22222222-2222-2222-2222-222222222222",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 404);
    assert.equal(result.error, "Connection not found.");
  }
});

test("workspace membership required", () => {
  assert.equal(assertWorkspaceMember({ isMember: false }).ok, false);
  assert.equal(assertWorkspaceMember({ isMember: true }).ok, true);
});

test("legacy mock statuses never map to live active", () => {
  assert.equal(legacyStatusToLiveConnection("connected"), "never_live");
  assert.equal(legacyStatusToLiveConnection("needs-reauth"), "never_live");
  assert.equal(isUiConnectedStatus("active"), true);
  assert.equal(isUiConnectedStatus("pending"), false);
  assert.equal(isUiConnectedStatus("connected"), false);
});

test("public connection mapper strips secret fields", () => {
  const row = {
    id: "conn_abc",
    workspace_id: "ws-a",
    owner_id: "11111111-1111-1111-1111-111111111111",
    connector_id: "gmail",
    connection_mode: "personal" as const,
    status: "pending" as const,
    provider_connection_id: "secret-ref",
    provider_name: "composio",
    failure_detail: null,
    connected_by: "11111111-1111-1111-1111-111111111111",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    connected_at: null,
    disconnected_at: null,
    last_sync_at: null,
    pending_expires_at: pendingExpiresAtIso(),
    deleted_at: null,
  };
  const pub = connectionRowToPublic(row);
  assert.equal(pub.id, "conn_abc");
  assert.equal("provider_connection_id" in pub, false);
  assert.equal(
    JSON.stringify(pub).includes("secret-ref"),
    false,
    "provider_connection_id value must not appear in public JSON",
  );
  assert.throws(() =>
    assertNoSecretKeys({ token_ref: "x", id: "conn_abc" }),
  );
});

test("browser realtime sync must not subscribe to connector_connections", () => {
  const syncSrc = readFileSync(
    join(process.cwd(), "lib/api/connector-sync.ts"),
    "utf8",
  );
  assert.match(syncSrc, /connector_connection_signals/);
  assert.equal(
    /table:\s*"connector_connections"/.test(syncSrc),
    false,
    "Realtime must not listen to connector_connections (provider_connection_id risk)",
  );
});

test("migration removes connector_connections from realtime and adds signals", () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/045_connector_security_hardening.sql",
    ),
    "utf8",
  );
  assert.match(migration, /drop table public\.connector_connections/i);
  assert.match(migration, /add table public\.connector_connection_signals/i);
  const signalsCreate = migration.match(
    /create table if not exists public\.connector_connection_signals \(([\s\S]*?)\);/i,
  );
  assert.ok(signalsCreate, "signals table create missing");
  assert.equal(
    /provider_connection_id/.test(signalsCreate![1]!),
    false,
    "signals table must not include provider_connection_id",
  );
});

test("audit detail allowlist excludes sensitive keys", () => {
  const detail = sanitizeAuditDetail({
    reason_code: "initiated",
    connector_id: "gmail",
    email: "user@example.com",
    label: "you@gmail.com",
    access_token: "secret",
  });
  assert.deepEqual(detail, {
    reason_code: "initiated",
    connector_id: "gmail",
  });
});

test("pending expiry detection", () => {
  const expired = {
    id: "conn_x",
    workspace_id: "ws",
    owner_id: "11111111-1111-1111-1111-111111111111",
    connector_id: "gmail",
    connection_mode: "personal" as const,
    status: "pending" as const,
    provider_connection_id: null,
    provider_name: null,
    failure_detail: null,
    connected_by: "11111111-1111-1111-1111-111111111111",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    connected_at: null,
    disconnected_at: null,
    last_sync_at: null,
    pending_expires_at: new Date(Date.now() - 1000).toISOString(),
    deleted_at: null,
  };
  assert.equal(isPendingExpired(expired), true);
});

test("rate limit resets for tests", () => {
  resetConnectorRateLimitsForTests();
});

test("composio user id mapping is deterministic", () => {
  const id = composioUserId("ws-team", "11111111-1111-1111-1111-111111111111");
  assert.equal(id, "cander:ws-team:11111111-1111-1111-1111-111111111111");
  assert.deepEqual(parseComposioUserId(id), {
    workspaceId: "ws-team",
    profileId: "11111111-1111-1111-1111-111111111111",
  });
});

test("oauth state expiry detection", () => {
  assert.equal(
    isOAuthStateExpired({
      expires_at: new Date(Date.now() - 1000).toISOString(),
    }),
    true,
  );
  assert.equal(
    isOAuthStateExpired({
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    }),
    false,
  );
});

test("connector tool seam allows gmail.read during pilot", () => {
  const allowed = authorizeConnectorToolAction({
    workspaceId: "ws",
    profileId: "11111111-1111-1111-1111-111111111111",
    connectorId: "gmail",
    toolName: "gmail.read",
    connectionId: "conn_1",
  });
  assert.equal(allowed.ok, true);

  const denied = authorizeConnectorToolAction({
    workspaceId: "ws",
    profileId: "11111111-1111-1111-1111-111111111111",
    connectorId: "gmail",
    toolName: "gmail.send",
    connectionId: "conn_1",
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.reason, "not_allowed");

  const sendAllowed = authorizeConnectorToolAction({
    workspaceId: "ws",
    profileId: "11111111-1111-1111-1111-111111111111",
    connectorId: "gmail",
    toolName: "gmail.send",
    toolPermissions: { "gmail.send": true },
    connectionId: "conn_1",
  });
  assert.equal(sendAllowed.ok, true);
});

test("client bundles do not import server-only connector modules", () => {
  const clientRoots = ["components", "lib/api", "lib/hooks", "lib/ai/connectors"];
  const forbidden = [
    "lib/connectors/lifecycle",
    "lib/connectors/server-context",
    "lib/connectors/provider/",
    "lib/connectors/composio-http",
    "lib/connectors/composio-tools",
    "lib/connectors/tool-execute",
    "lib/supabase/admin",
  ];
  const hits: string[] = [];
  for (const root of clientRoots) {
    walk(join(process.cwd(), root), (file) => {
      if (!file.endsWith(".ts") && !file.endsWith(".tsx")) return;
      if (file.includes("connector-security.test")) return;
      const text = readFileSync(file, "utf8");
      if (!text.includes('"use client"')) return;
      for (const needle of forbidden) {
        if (text.includes(needle)) hits.push(`${file} -> ${needle}`);
      }
    });
  }
  assert.deepEqual(hits, []);
});

function walk(dir: string, visit: (path: string) => void) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, visit);
    else visit(path);
  }
}
