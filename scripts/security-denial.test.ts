import assert from "node:assert/strict";
import { test } from "node:test";
import {
  escapeHtml,
  filterOrgWorkspaceIds,
  safeAuthNextPath,
} from "../lib/security.ts";

test("safeAuthNextPath rejects open redirects", () => {
  assert.equal(safeAuthNextPath("/settings"), "/settings");
  assert.equal(safeAuthNextPath("/?auth=verified"), "/?auth=verified");
  assert.equal(safeAuthNextPath("//evil.com"), "/");
  assert.equal(safeAuthNextPath("/\\evil.com"), "/");
  assert.equal(safeAuthNextPath("https://evil.com"), "/");
  assert.equal(safeAuthNextPath("/%2F%2Fevil.com"), "/");
  assert.equal(safeAuthNextPath(null), "/");
});

test("filterOrgWorkspaceIds denies cross-tenant ids", () => {
  assert.deepEqual(
    filterOrgWorkspaceIds(["ws-a", "ws-foreign", "ws-a"], ["ws-a", "ws-b"]),
    ["ws-a"],
  );
  assert.deepEqual(filterOrgWorkspaceIds(["ws-x"], ["ws-a"]), []);
  assert.deepEqual(filterOrgWorkspaceIds(undefined, ["ws-a"]), []);
});

test("escapeHtml neutralizes markup", () => {
  assert.equal(
    escapeHtml(`<img src=x onerror="alert(1)"> & "hi"`),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &quot;hi&quot;",
  );
});
