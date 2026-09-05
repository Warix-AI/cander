import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mergeToolPermissions,
  sanitizeToolPermissionsPatch,
  enabledToolIds,
} from "../lib/connectors/tool-catalog.ts";

test("sanitizeToolPermissionsPatch keeps known gmail tools only", () => {
  const patch = sanitizeToolPermissionsPatch("gmail", {
    "gmail.send": true,
    "gmail.read": false,
    "evil.tool": true,
    note: "nope",
  });
  assert.deepEqual(patch, {
    "gmail.send": true,
    "gmail.read": false,
  });
});

test("mergeToolPermissions applies patch over defaults", () => {
  const merged = mergeToolPermissions("gmail", {}, { "gmail.send": true });
  assert.equal(merged["gmail.send"], true);
  assert.equal(merged["gmail.search"], true);
  assert.equal(merged["gmail.read"], true);
});

test("enabledToolIds excludes disabled skills", () => {
  const enabled = enabledToolIds("gmail", {
    "gmail.search": false,
    "gmail.read": true,
    "gmail.send": false,
    "gmail.draft": false,
    "gmail.reply": false,
    "gmail.archive": false,
    "gmail.markRead": false,
    "gmail.markUnread": false,
  });
  assert.deepEqual(enabled, ["gmail.read"]);
});
