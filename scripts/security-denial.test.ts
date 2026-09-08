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
import {
  canAccessProjectState,
  isSharedWorkspaceState,
} from "../lib/security/project-access-state.ts";
import { resolveAuthorizedToolNames } from "../lib/ai/tools/registry.ts";
import { trustedApplicationOrigin } from "../lib/security/server-origin.ts";
import { isManagedWorkspaceIconUrl } from "../lib/security/storage-url.ts";

test("safeAuthNextPath rejects open redirects", () => {
  assert.equal(safeAuthNextPath("/settings"), "/settings");
  assert.equal(safeAuthNextPath("/?auth=verified"), "/?auth=verified");
  assert.equal(safeAuthNextPath("//evil.com"), "/");
  assert.equal(safeAuthNextPath("/\\evil.com"), "/");
  assert.equal(safeAuthNextPath("https://evil.com"), "/");
  assert.equal(safeAuthNextPath("/%2F%2Fevil.com"), "/");
  assert.equal(safeAuthNextPath(null), "/");
});

test("server return origins reject untrusted production hosts", () => {
  assert.equal(
    trustedApplicationOrigin({
      requestUrl: "https://evil.example/api/stripe/checkout",
      configuredUrls: ["https://app.cander.example"],
      production: true,
    }),
    null,
  );
  assert.equal(
    trustedApplicationOrigin({
      requestUrl: "https://app.cander.example/api/stripe/checkout",
      configuredUrls: ["https://app.cander.example"],
      production: true,
    }),
    "https://app.cander.example",
  );
  assert.equal(
    trustedApplicationOrigin({
      requestUrl: "http://localhost:3000/api/stripe/checkout",
      production: true,
    }),
    "http://localhost:3000",
  );
});

test("workspace icon URLs must come from the owning storage path", () => {
  const base = "https://project.supabase.co";
  assert.equal(
    isManagedWorkspaceIconUrl({
      iconUrl:
        "https://project.supabase.co/storage/v1/object/public/workspace-icons/ws-a/icon.png?v=1",
      workspaceId: "ws-a",
      storageOrigin: base,
    }),
    true,
  );
  assert.equal(
    isManagedWorkspaceIconUrl({
      iconUrl:
        "https://project.supabase.co/storage/v1/object/public/workspace-icons/ws-other/icon.png",
      workspaceId: "ws-a",
      storageOrigin: base,
    }),
    false,
  );
  assert.equal(
    isManagedWorkspaceIconUrl({
      iconUrl: "https://tracker.example/icon.png",
      workspaceId: "ws-a",
      storageOrigin: base,
    }),
    false,
  );
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

test("shared workspace = business or 2+ members", () => {
  assert.equal(
    isSharedWorkspaceState({ kind: "business", memberCount: 1 }),
    true,
  );
  assert.equal(
    isSharedWorkspaceState({ kind: "personal", memberCount: 2 }),
    true,
  );
  assert.equal(
    isSharedWorkspaceState({ kind: "personal", memberCount: 1 }),
    false,
  );
});

test("projects private unless shared workspace", () => {
  assert.equal(
    canAccessProjectState({
      actorId: "a",
      createdBy: "a",
      isMember: true,
      shared: false,
    }),
    true,
  );
  assert.equal(
    canAccessProjectState({
      actorId: "b",
      createdBy: "a",
      isMember: true,
      shared: false,
    }),
    false,
  );
  assert.equal(
    canAccessProjectState({
      actorId: "b",
      createdBy: "a",
      isMember: true,
      shared: true,
    }),
    true,
  );
  assert.equal(
    canAccessProjectState({
      actorId: "b",
      createdBy: "a",
      isMember: false,
      shared: true,
    }),
    false,
  );
});
