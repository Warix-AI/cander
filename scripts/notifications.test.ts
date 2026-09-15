import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildNotifyDeepLink,
  parseNotifyDeepLink,
  resolveNotificationRoute,
} from "../lib/notifications/resolve-notification-route.ts";
import {
  channelAllowed,
  normalizeNotificationPreferences,
} from "../lib/notifications/preferences.ts";
import type { NotificationRecord } from "../lib/notifications/types.ts";

describe("notification routing", () => {
  it("resolves gmail thread targets", () => {
    const resolved = resolveNotificationRoute({
      connector: "gmail",
      connectionId: "conn_1",
      resourceType: "gmail_thread",
      resourceId: "thread_abc",
      metadata: { messageId: "msg_1", threadId: "thread_abc" },
    });
    assert.equal(resolved.kind, "connector");
    if (resolved.kind === "connector") {
      assert.equal(resolved.connectorId, "gmail");
      assert.equal(resolved.focus.connectionId, "conn_1");
      assert.equal(resolved.focus.messageId, "msg_1");
      assert.equal(resolved.focus.threadId, "thread_abc");
    }
  });

  it("round-trips cander://notify deep links", () => {
    const url = buildNotifyDeepLink({
      connector: "gmail",
      connectionId: "c1",
      resourceType: "gmail_thread",
      resourceId: "t1",
      metadata: { messageId: "m1", threadId: "t1" },
    });
    assert.match(url, /^cander:\/\/notify\?/);
    const parsed = parseNotifyDeepLink(url);
    assert.ok(parsed);
    assert.equal(parsed?.connector, "gmail");
    assert.equal(parsed?.connectionId, "c1");
    assert.equal(parsed?.metadata?.messageId, "m1");
  });
});

describe("notification preferences", () => {
  const base: NotificationRecord = {
    id: "nt_1",
    profileId: "p1",
    workspaceId: "w1",
    type: "connector.gmail.new_email",
    title: "A",
    body: "B",
    connector: "gmail",
    connectionId: "c1",
    resourceType: "gmail_thread",
    resourceId: "t1",
    route: null,
    metadata: {},
    dedupeKey: null,
    readAt: null,
    createdAt: new Date().toISOString(),
  };

  it("respects global and type toggles", () => {
    const prefs = normalizeNotificationPreferences({
      global_enabled: true,
      channels: { mobile_push: true, in_app: true },
      types: { "connector.gmail.new_email": false },
    });
    assert.equal(channelAllowed(prefs, "mobile_push", base), false);
    prefs.types["connector.gmail.new_email"] = true;
    assert.equal(channelAllowed(prefs, "mobile_push", base), true);
  });
});
