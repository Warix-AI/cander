import assert from "node:assert/strict";
import { test } from "node:test";
import {
  escapeHtml,
  filterOrgWorkspaceIds,
  safeAuthNextPath,
} from "../lib/security.ts";
import {
  assertUniqueProjectTitle,
  isProjectTitleTaken,
  normalizeProjectTitle,
} from "../lib/project-name.ts";
import {
  assertAiChatOwner,
  assertBridgeUrlSafeForEdge,
  assertContextRefAccess,
  assertIntelligenceWorkspaceBound,
  assertNotSharedWorkspaceAccess,
  formatContextBlock,
  isLocalOrPrivateUrl,
  resolveChatWorkspaceId,
} from "../lib/ai/authz.ts";
import { resolveAuthorizedToolNames } from "../lib/ai/tools/registry.ts";

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

test("project titles must be unique in a workspace", () => {
  const projects = [
    { id: "a", title: "Northwind" },
    { id: "b", title: "Acme Site" },
  ];
  assert.equal(normalizeProjectTitle("  Hello   World "), "Hello World");
  assert.equal(isProjectTitleTaken(projects, "northwind"), true);
  assert.equal(isProjectTitleTaken(projects, "Northwind", "a"), false);
  assert.equal(isProjectTitleTaken(projects, "Fresh Name"), false);
  assert.equal(assertUniqueProjectTitle(projects, " Fresh Name "), "Fresh Name");
  assert.throws(
    () => assertUniqueProjectTitle(projects, "ACME SITE"),
    /already uses that name/i,
  );
  assert.throws(() => assertUniqueProjectTitle(projects, "   "), /required/i);
});

test("private AI chat denies cross-user access", () => {
  assert.throws(
    () => assertAiChatOwner({ chatOwnerId: "user-a", actorId: "user-b" }),
    /Forbidden/,
  );
  assert.doesNotThrow(() =>
    assertAiChatOwner({ chatOwnerId: "user-a", actorId: "user-a" }),
  );
});

test("workspace membership does not grant private AI chat access", () => {
  assert.throws(
    () =>
      assertNotSharedWorkspaceAccess({
        actorId: "member",
        chatOwnerId: "owner",
        isWorkspaceMember: true,
      }),
    /workspace members cannot access/,
  );
});

test("invalid context references are rejected", () => {
  assert.throws(
    () =>
      assertContextRefAccess({
        actorId: "u1",
        isWorkspaceMember: true,
        entityExists: false,
        entityWorkspaceId: "ws-1",
        requestedWorkspaceId: "ws-1",
      }),
    /Invalid context/,
  );
  assert.throws(
    () =>
      assertContextRefAccess({
        actorId: "u1",
        isWorkspaceMember: false,
        entityExists: true,
        entityWorkspaceId: "ws-1",
        requestedWorkspaceId: "ws-1",
      }),
    /not a member/,
  );
  assert.throws(
    () =>
      assertContextRefAccess({
        actorId: "u1",
        isWorkspaceMember: true,
        entityExists: true,
        entityWorkspaceId: "ws-1",
        requestedWorkspaceId: "ws-other",
      }),
    /workspace mismatch/,
  );
});

test("bridge URL for Edge must be public HTTPS", () => {
  assert.equal(isLocalOrPrivateUrl("http://127.0.0.1:8787"), true);
  assert.equal(isLocalOrPrivateUrl("https://bridge.example.com"), false);
  assert.throws(
    () => assertBridgeUrlSafeForEdge("http://127.0.0.1:8787"),
    /HTTPS/,
  );
  assert.throws(
    () => assertBridgeUrlSafeForEdge("https://127.0.0.1:8787"),
    /localhost|private/i,
  );
  assert.doesNotThrow(() =>
    assertBridgeUrlSafeForEdge("https://cander-bridge.example.com"),
  );
});

test("client-supplied tool names must be registered", () => {
  assert.throws(
    () => resolveAuthorizedToolNames(["not.a.real.tool"]),
    /Unknown or disabled/,
  );
  // Enabled tools resolve; unknown names still deny.
  const allowed = resolveAuthorizedToolNames(["workspace.search"]);
  assert.equal(allowed.length, 1);
  assert.equal(allowed[0]?.name, "workspace.search");
  assert.deepEqual(resolveAuthorizedToolNames([]), []);
  assert.deepEqual(resolveAuthorizedToolNames(undefined), []);
});

test("context block formats authorized summaries only", () => {
  assert.equal(formatContextBlock([]), "");
  assert.match(
    formatContextBlock([{ kind: "project", title: "Northwind", detail: "build" }]),
    /Northwind/,
  );
  assert.match(
    formatContextBlock([{ kind: "project", title: "Northwind" }]),
    /authorized workspace context/,
  );
});

test("intelligence rows require non-null workspace membership", () => {
  assert.throws(
    () =>
      assertIntelligenceWorkspaceBound({
        workspaceId: null,
        isWorkspaceMember: true,
      }),
    /require a workspace_id/,
  );
  assert.throws(
    () =>
      assertIntelligenceWorkspaceBound({
        workspaceId: "ws-a",
        isWorkspaceMember: false,
      }),
    /not a member/,
  );
  assert.equal(
    assertIntelligenceWorkspaceBound({
      workspaceId: "  ws-a  ",
      isWorkspaceMember: true,
    }),
    "ws-a",
  );
});

test("create_chat only attaches workspace when actor is a member", () => {
  assert.equal(
    resolveChatWorkspaceId({
      requestedWorkspaceId: "ws-foreign",
      isWorkspaceMember: false,
    }),
    null,
  );
  assert.equal(
    resolveChatWorkspaceId({
      requestedWorkspaceId: "ws-a",
      isWorkspaceMember: true,
    }),
    "ws-a",
  );
  assert.equal(
    resolveChatWorkspaceId({
      requestedWorkspaceId: null,
      isWorkspaceMember: true,
    }),
    null,
  );
});
