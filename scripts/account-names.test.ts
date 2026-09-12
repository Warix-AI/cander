import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_CONNECTOR_ACCOUNTS_PER_CONNECTOR,
  canAddAnotherConnectorAccount,
  normalizeConnectorDisplayName,
  validateUniqueConnectorDisplayName,
} from "../lib/connectors/account-names.ts";

test("normalizeConnectorDisplayName trims and enforces 1–10 chars", () => {
  assert.deepEqual(normalizeConnectorDisplayName("  Team  "), {
    ok: true,
    value: "Team",
  });
  assert.equal(normalizeConnectorDisplayName("").ok, false);
  assert.equal(normalizeConnectorDisplayName("abcdefghijk").ok, false);
});

test("validateUniqueConnectorDisplayName is case-insensitive", () => {
  const result = validateUniqueConnectorDisplayName({
    raw: "team",
    existing: [{ id: "1", displayName: "Team" }],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /already used/i);
  }
  assert.deepEqual(
    validateUniqueConnectorDisplayName({
      raw: "Team",
      existing: [{ id: "1", displayName: "Team" }],
      excludeId: "1",
    }),
    { ok: true, value: "Team" },
  );
});

test("account limit is three", () => {
  assert.equal(MAX_CONNECTOR_ACCOUNTS_PER_CONNECTOR, 3);
  assert.equal(canAddAnotherConnectorAccount(2), true);
  assert.equal(canAddAnotherConnectorAccount(3), false);
});

test("default Account label shows as Rename in nav", async () => {
  const {
    connectorAccountNavLabel,
    connectorAccountNeedsRename,
  } = await import("../lib/connectors/account-names.ts");
  assert.equal(connectorAccountNeedsRename("Account"), true);
  assert.equal(connectorAccountNeedsRename("  "), true);
  assert.equal(connectorAccountNeedsRename("Team"), false);
  assert.equal(connectorAccountNavLabel("Account"), "Rename");
  assert.equal(connectorAccountNavLabel("Team"), "Team");
});
