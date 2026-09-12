import assert from "node:assert/strict";
import test from "node:test";
import { connectionRowToPublic } from "../lib/connectors/mapper.ts";
import type { ConnectorConnectionRow } from "../lib/connectors/mapper.ts";

function baseRow(
  overrides: Partial<ConnectorConnectionRow> = {},
): ConnectorConnectionRow {
  return {
    id: "conn_1",
    workspace_id: "ws_1",
    owner_id: "user_owner",
    connector_id: "gmail",
    connection_mode: "personal",
    status: "active",
    display_name: "Work",
    provider_connection_id: "prov_1",
    provider_name: "composio",
    failure_detail: null,
    connected_by: "user_owner",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    connected_at: "2026-01-01T00:00:00.000Z",
    disconnected_at: null,
    last_sync_at: null,
    pending_expires_at: null,
    deleted_at: null,
    tool_permissions: {},
    ...overrides,
  };
}

test("ownedByViewer is true for the connection owner", () => {
  const pub = connectionRowToPublic(baseRow(), { viewerId: "user_owner" });
  assert.equal(pub.ownedByViewer, true);
  assert.equal(pub.connectionMode, "personal");
});

test("ownedByViewer is false for another workspace member viewing a shared row", () => {
  const pub = connectionRowToPublic(
    baseRow({ connection_mode: "workspace_shared" }),
    { viewerId: "user_member" },
  );
  assert.equal(pub.ownedByViewer, false);
  assert.equal(pub.connectionMode, "workspace_shared");
});

test("public mapper never leaks provider_connection_id", () => {
  const pub = connectionRowToPublic(baseRow(), { viewerId: "user_owner" });
  assert.equal("provider_connection_id" in pub, false);
  assert.equal(JSON.stringify(pub).includes("prov_1"), false);
});
