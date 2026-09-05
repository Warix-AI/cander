/**
 * Fail-closed connector chip scope + two-user IDOR matrix (unit).
 * Live JWT matrix lives in scripts/security-isolation-probe.ts.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveConnectorScope } from "../lib/ai/tools/connector-scope.ts";
import { discoverRelevantTools } from "../lib/ai/tools/discovery.ts";
import { getCanderTool } from "../lib/ai/tools/cander-registry.ts";
import { defaultToolPermissions } from "../lib/connectors/tool-catalog.ts";
import type { CapabilitySnapshot } from "../lib/ai/tools/types.ts";

const USER_A = {
  profileId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  connections: [
    { connectionId: "conn_a_gmail", connectorId: "gmail" },
    { connectionId: "conn_a_slack", connectorId: "slack" },
  ],
};

const USER_B = {
  profileId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  connections: [
    { connectionId: "conn_b_gmail", connectorId: "gmail" },
    { connectionId: "conn_b_slack", connectorId: "slack" },
  ],
};

function dualConnectorSnapshot(): CapabilitySnapshot {
  return {
    connectors: [
      {
        connectorId: "gmail",
        label: "Gmail",
        capabilityFamily: "email",
        accounts: [
          {
            connectionId: "conn_a_gmail",
            label: "Gmail",
            status: "active",
            capabilities: { search: true, read: true, send: true },
          },
        ],
      },
      {
        connectorId: "slack",
        label: "Slack",
        capabilityFamily: "messaging",
        accounts: [
          {
            connectionId: "conn_a_slack",
            label: "Slack",
            status: "active",
            capabilities: { search: true, read: true, send: true },
          },
        ],
      },
    ],
    families: {
      email: { connected: true, connectorIds: ["gmail"], accounts: [] },
      messaging: { connected: true, connectorIds: ["slack"], accounts: [] },
    },
  };
}

test("M1: unresolved chip ids fail closed (no prefer ids)", () => {
  const scope = resolveConnectorScope({
    selectedConnectionIds: ["conn_forged_or_stale"],
    activeConnections: USER_A.connections,
  });
  assert.equal(scope.scopeRequested, true);
  assert.equal(scope.failClosed, true);
  assert.deepEqual(scope.scopedConnections, []);
  assert.deepEqual(scope.preferConnectorIds, []);
});

test("M1: valid chip resolves to that connector only", () => {
  const scope = resolveConnectorScope({
    selectedConnectionIds: ["conn_a_gmail"],
    activeConnections: USER_A.connections,
  });
  assert.equal(scope.failClosed, false);
  assert.deepEqual(scope.preferConnectorIds, ["gmail"]);
  assert.equal(scope.scopedConnections.length, 1);
});

test("M1 IDOR matrix: user B cannot resolve user A connection ids", () => {
  const matrix = [
    {
      name: "B chip with A gmail id",
      selected: ["conn_a_gmail"],
      active: USER_B.connections,
      expectFailClosed: true,
    },
    {
      name: "A chip with B slack id",
      selected: ["conn_b_slack"],
      active: USER_A.connections,
      expectFailClosed: true,
    },
    {
      name: "mixed forged + own id still only own",
      selected: ["conn_a_gmail", "conn_b_gmail"],
      active: USER_A.connections,
      expectFailClosed: false,
      expectPrefer: ["gmail"],
    },
    {
      name: "empty selection is unscoped (not fail-closed)",
      selected: [] as string[],
      active: USER_A.connections,
      expectFailClosed: false,
      expectPrefer: [] as string[],
    },
  ];

  for (const row of matrix) {
    const scope = resolveConnectorScope({
      selectedConnectionIds: row.selected,
      activeConnections: row.active,
    });
    assert.equal(
      scope.failClosed,
      row.expectFailClosed,
      row.name,
    );
    if (row.expectPrefer) {
      assert.deepEqual(scope.preferConnectorIds, row.expectPrefer, row.name);
    }
  }
});

test("M2: scoped discovery empty never opens all_connected_families", () => {
  const scope = resolveConnectorScope({
    selectedConnectionIds: ["conn_forged"],
    activeConnections: USER_A.connections,
  });
  assert.equal(scope.failClosed, true);

  // Agent path: failClosed → empty discovery; if somehow prefer leaked, discovery still closed.
  const leaked = discoverRelevantTools({
    userMessage: "search email and slack",
    snapshot: dualConnectorSnapshot(),
    preferConnectorIds: ["missing-connector"],
  });
  assert.deepEqual(leaked.toolIds, []);
  assert.match(leaked.reason, /scoped_empty/);
});

test("M2: valid scope only exposes that connector family tools", () => {
  const scope = resolveConnectorScope({
    selectedConnectionIds: ["conn_a_gmail"],
    activeConnections: USER_A.connections,
  });
  const discovered = discoverRelevantTools({
    userMessage: "post in slack and search mail",
    snapshot: dualConnectorSnapshot(),
    preferConnectorIds: scope.preferConnectorIds,
  });
  assert.ok(discovered.toolIds.length > 0);
  assert.ok(discovered.toolIds.every((id) => id.startsWith("gmail.")));
  assert.equal(
    discovered.toolIds.some((id) => id.startsWith("slack.")),
    false,
  );
});

test("M5: gmail.archive default-disabled; mark read/unread enabled without confirm", () => {
  const archive = getCanderTool("gmail.archive")!;
  const markRead = getCanderTool("gmail.markRead")!;
  const markUnread = getCanderTool("gmail.markUnread")!;
  assert.equal(archive.defaultEnabled, false);
  assert.equal(archive.risk, "write");
  assert.equal(markRead.defaultEnabled, true);
  assert.equal(markRead.confirmationPolicy, "never");
  assert.equal(markUnread.defaultEnabled, true);
  assert.equal(markUnread.confirmationPolicy, "never");

  const defaults = defaultToolPermissions("gmail");
  assert.equal(defaults["gmail.archive"], false);
  assert.equal(defaults["gmail.markRead"], true);
  assert.equal(defaults["gmail.markUnread"], true);
  assert.equal(defaults["gmail.read"], true);
  assert.equal(defaults["gmail.send"], false);
});

test("M3: migration revokes authenticated SELECT on provider_connection_id", () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/050_connector_secret_column_privileges.sql",
    ),
    "utf8",
  );
  assert.match(migration, /revoke select on table public\.connector_connections/i);
  assert.match(migration, /provider_connection_id/);
  assert.match(migration, /composio_user_id/);
  assert.match(
    migration,
    /grant select \([\s\S]*tool_permissions[\s\S]*\) on table public\.connector_connections to authenticated/i,
  );
  // Column grant list must omit secrets (comment may still mention them).
  const grantBlock = migration.match(
    /grant select \(([\s\S]*?)\) on table public\.connector_connections to authenticated/i,
  );
  assert.ok(grantBlock, "authenticated column grant missing");
  assert.equal(
    /provider_connection_id|composio_user_id/.test(grantBlock![1]!),
    false,
    "authenticated SELECT grant must omit secret columns",
  );
});

test("M4: OAuth active-connection recovery always scopes workspace_id", () => {
  const src = readFileSync(
    join(process.cwd(), "lib/connectors/lifecycle.ts"),
    "utf8",
  );
  assert.match(
    src,
    /async function findActiveConnectionForOwnerOAuth\(\s*admin: SupabaseClient,\s*ownerId: string,\s*workspaceId: string,/s,
  );
  assert.match(
    src,
    /\.eq\("workspace_id", scopedWorkspace\)/,
  );
  assert.equal(
    /workspaceId\?:\s*string/.test(src.split("findActiveConnectionForOwnerOAuth")[1]!.slice(0, 400)),
    false,
    "workspaceId must be required, not optional",
  );
});
