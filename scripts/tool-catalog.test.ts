import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accessTierEnabled,
  defaultToolPermissions,
  resolveToolPermissions,
  setAccessTier,
} from "../lib/connectors/tool-catalog.ts";

test("default Gmail permissions enable all skills", () => {
  const defaults = defaultToolPermissions("gmail");
  assert.equal(defaults["gmail.search"], true);
  assert.equal(defaults["gmail.read"], true);
  assert.equal(defaults["gmail.markRead"], true);
  assert.equal(defaults["gmail.markUnread"], true);
  assert.equal(defaults["gmail.archive"], true);
  assert.equal(defaults["gmail.send"], true);
  assert.equal(defaults["gmail.draft"], true);
  assert.equal(defaults["gmail.reply"], true);
});

test("setAccessTier toggles all tools in a tier", () => {
  const next = setAccessTier("gmail", "write", true, {});
  assert.equal(next["gmail.send"], true);
  assert.equal(accessTierEnabled("gmail", "write", next), true);
  assert.equal(accessTierEnabled("gmail", "read", next), true);
});

test("resolveToolPermissions merges stored overrides", () => {
  const resolved = resolveToolPermissions("gmail", { "gmail.send": true });
  assert.equal(resolved["gmail.send"], true);
  assert.equal(resolved["gmail.search"], true);
});
