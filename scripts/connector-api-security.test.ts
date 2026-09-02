/**
 * Connector API security contract tests.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { authorizeConnectorToolAction } from "../lib/connectors/tool-authz.ts";
import { authorizeToolExecution } from "../lib/connectors/authorization.ts";
import { connectionNotFoundError } from "../lib/connectors/authz.ts";
import {
  checkConnectorRateLimit,
  resetConnectorRateLimitsForTests,
} from "../lib/connectors/rate-limit.ts";
import { composioUserId, parseComposioUserId } from "../lib/connectors/composio-identity.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

  it("tool must belong to the requested connector", () => {
    const mismatched = authorizeConnectorToolAction({
      workspaceId: "ws-a",
      profileId: "user-a",
      connectorId: "slack",
      toolName: "gmail.read",
      connectionId: "conn-1",
    });
    assert.equal(mismatched.ok, false);
    if (!mismatched.ok) assert.equal(mismatched.reason, "not_allowed");

    const slackAllowed = authorizeConnectorToolAction({
      workspaceId: "ws-a",
      profileId: "user-a",
      connectorId: "slack",
      toolName: "slack.search",
      toolPermissions: { "slack.search": true },
      connectionId: "conn-1",
    });
    assert.equal(slackAllowed.ok, true);
  });

  it("client confirmed:true cannot satisfy confirmation_required", () => {
    const connection = {
      connectionId: "conn-1",
      connectorId: "gmail",
      providerConnectionId: "secret-ref",
      toolPermissions: { "gmail.send": true },
      label: "Gmail",
      status: "active",
    };
    // Ambiguous send requires confirmation; untrusted callers pass confirmed=false.
    const blocked = authorizeToolExecution("gmail.send", {
      workspaceId: "ws-a",
      profileId: "user-a",
      connection,
      confirmed: false,
      arguments: { to: "", subject: "Hi", body: "Hello" },
    });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.reason, "confirmation_required");

    // Spoofing confirmed=true is only valid on trusted server paths (agent).
    // The HTTP route must force confirmed:false — assert that contract in source.
    const routeSrc = readFileSync(
      join(process.cwd(), "app/api/connectors/tools/execute/route.ts"),
      "utf8",
    );
    assert.match(routeSrc, /confirmed:\s*false/);
    assert.equal(
      /confirmed:\s*body\.confirmed/.test(routeSrc),
      false,
      "HTTP execute route must not forward client confirmed",
    );
  });

  it("trusted server confirmation still allows ambiguous write once confirmed", () => {
    const connection = {
      connectionId: "conn-1",
      connectorId: "gmail",
      providerConnectionId: "secret-ref",
      toolPermissions: { "gmail.send": true },
      label: "Gmail",
      status: "active",
    };
    const allowed = authorizeToolExecution("gmail.send", {
      workspaceId: "ws-a",
      profileId: "user-a",
      connection,
      confirmed: true,
      arguments: { to: "", subject: "Hi", body: "Hello" },
    });
    assert.equal(allowed.ok, true);
  });

  it("read tools do not require confirmation", () => {
    const connection = {
      connectionId: "conn-1",
      connectorId: "gmail",
      providerConnectionId: "secret-ref",
      toolPermissions: { "gmail.search": true, "gmail.read": true },
      label: "Gmail",
      status: "active",
    };
    for (const tool of ["gmail.search", "gmail.read"] as const) {
      const result = authorizeToolExecution(tool, {
        workspaceId: "ws-a",
        profileId: "user-a",
        connection,
        confirmed: false,
        arguments: { query: "from:alex" },
      });
      assert.equal(result.ok, true, tool);
    }
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
