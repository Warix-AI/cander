/**
 * Connector API security contract tests.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { authorizeConnectorToolAction } from "../lib/connectors/tool-authz.ts";
import { connectionNotFoundError } from "../lib/connectors/authz.ts";
import {
  checkConnectorRateLimit,
  resetConnectorRateLimitsForTests,
} from "../lib/connectors/rate-limit.ts";
import { composioUserId, parseComposioUserId } from "../lib/connectors/composio-identity.ts";

describe("connector API security contract", () => {
  it("cross-user connection lookup returns uniform not-found", () => {
    const err = connectionNotFoundError();
    assert.equal(err.status, 404);
    assert.match(err.error, /not found/i);
  });

  it("gmail.send is denied unless write permission is enabled", () => {
    const denied = authorizeConnectorToolAction({
      workspaceId: "ws-a",
      profileId: "user-a",
      connectorId: "gmail",
      toolName: "gmail.send",
      connectionId: "conn-1",
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.reason, "not_allowed");

    const allowed = authorizeConnectorToolAction({
      workspaceId: "ws-a",
      profileId: "user-a",
      connectorId: "gmail",
      toolName: "gmail.send",
      toolPermissions: { "gmail.send": true },
      connectionId: "conn-1",
    });
    assert.equal(allowed.ok, true);
  });

  it("gmail.search is denied when search permission is disabled", () => {
    const denied = authorizeConnectorToolAction({
      workspaceId: "ws-a",
      profileId: "user-a",
      connectorId: "gmail",
      toolName: "gmail.search",
      toolPermissions: {
        "gmail.search": false,
        "gmail.read": true,
        "gmail.send": false,
      },
      connectionId: "conn-1",
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.reason, "not_allowed");

    const allowed = authorizeConnectorToolAction({
      workspaceId: "ws-a",
      profileId: "user-a",
      connectorId: "gmail",
      toolName: "gmail.search",
      toolPermissions: { "gmail.search": true },
      connectionId: "conn-1",
    });
    assert.equal(allowed.ok, true);
  });

  it("gmail.draft and gmail.reply require explicit write permissions", () => {
    for (const toolName of ["gmail.draft", "gmail.reply"] as const) {
      const denied = authorizeConnectorToolAction({
        workspaceId: "ws-a",
        profileId: "user-a",
        connectorId: "gmail",
        toolName,
        connectionId: "conn-1",
      });
      assert.equal(denied.ok, false, toolName);

      const allowed = authorizeConnectorToolAction({
        workspaceId: "ws-a",
        profileId: "user-a",
        connectorId: "gmail",
        toolName,
        toolPermissions: { [toolName]: true },
        connectionId: "conn-1",
      });
      assert.equal(allowed.ok, true, toolName);
    }
  });

  it("non-gmail connector is disabled at authz layer", () => {
    const result = authorizeConnectorToolAction({
      workspaceId: "ws-a",
      profileId: "user-a",
      connectorId: "slack",
      toolName: "gmail.read",
      connectionId: "conn-1",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "connector_disabled");
  });

  it("in-memory rate limit blocks after threshold", () => {
    resetConnectorRateLimitsForTests();
    const key = "probe:rate";
    for (let i = 0; i < 30; i++) {
      assert.equal(checkConnectorRateLimit(key).ok, true);
    }
    const blocked = checkConnectorRateLimit(key);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.status, 429);
  });

  it("composio user ids isolate workspace and profile", () => {
    const a = composioUserId("ws-1", "11111111-1111-1111-1111-111111111111");
    const b = composioUserId("ws-2", "11111111-1111-1111-1111-111111111111");
    const c = composioUserId("ws-1", "22222222-2222-2222-2222-222222222222");
    assert.notEqual(a, b);
    assert.notEqual(a, c);
    assert.deepEqual(parseComposioUserId(a), {
      workspaceId: "ws-1",
      profileId: "11111111-1111-1111-1111-111111111111",
    });
  });
});
