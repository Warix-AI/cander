/**
 * Hydrate merge must not keep a stale shorter local transcript when Supabase
 * has the full multi-turn chat.
 * Run: node --experimental-strip-types --test scripts/chat-hydrate-merge.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mergeHydratedThread } from "../lib/chat-hydrate-merge.ts";
import type { Thread } from "../lib/types.ts";

function thread(
  partial: Partial<Thread> & Pick<Thread, "id" | "messages" | "updatedAt">,
): Thread {
  return {
    title: partial.title ?? "Chat",
    workspaceId: partial.workspaceId ?? "ws-1",
    snippet: partial.snippet ?? "",
    ...partial,
  };
}

describe("mergeHydratedThread", () => {
  it("prefers longer newer remote over stale 2-message local", () => {
    const local = thread({
      id: "t-u2k7sg",
      updatedAt: "2026-09-03T21:00:16.768Z",
      messages: [
        {
          id: "u-1",
          role: "user",
          content: "check gmail",
          at: "2:59 PM",
        },
        {
          id: "a-1",
          role: "assistant",
          content: "No reply yet",
          at: "2:59 PM",
        },
      ],
    });
    const remote = thread({
      id: "t-u2k7sg",
      updatedAt: "2026-09-03T21:07:17.226Z",
      snippet: "September 14th",
      messages: [
        ...local.messages,
        {
          id: "u-2",
          role: "user",
          content: "check again",
          at: "3:01 PM",
        },
        {
          id: "a-2",
          role: "assistant",
          content: "Still nothing",
          at: "3:01 PM",
        },
        {
          id: "u-3",
          role: "user",
          content: "send Amy Boise",
          at: "3:05 PM",
        },
        {
          id: "a-3",
          role: "assistant",
          content: "Sent",
          at: "3:05 PM",
        },
      ],
    });

    const merged = mergeHydratedThread(local, remote);
    assert.equal(merged.messages.length, 6);
    assert.equal(merged.snippet, "September 14th");
    assert.equal(merged.messages.at(-1)?.id, "a-3");
  });

  it("keeps longer local when remote is behind", () => {
    const remote = thread({
      id: "t-1",
      updatedAt: "2026-09-03T21:00:00.000Z",
      messages: [
        { id: "u-1", role: "user", content: "hi", at: "1:00 PM" },
        { id: "a-1", role: "assistant", content: "hello", at: "1:00 PM" },
      ],
    });
    const local = thread({
      id: "t-1",
      updatedAt: "2026-09-03T21:00:05.000Z",
      messages: [
        ...remote.messages,
        { id: "u-2", role: "user", content: "more", at: "1:01 PM" },
        { id: "a-2", role: "assistant", content: "ok", at: "1:01 PM" },
      ],
    });

    const merged = mergeHydratedThread(local, remote);
    assert.equal(merged.messages.length, 4);
    assert.equal(merged.messages.at(-1)?.id, "a-2");
  });

  it("keeps fresher local on hard replace even if remote has extras", () => {
    const local = thread({
      id: "t-session-ws-1",
      updatedAt: "2026-09-03T22:00:00.000Z",
      messages: [
        { id: "u-new", role: "user", content: "new default", at: "4:00 PM" },
        { id: "a-new", role: "assistant", content: "ready", at: "4:00 PM" },
      ],
    });
    const remote = thread({
      id: "t-session-ws-1",
      updatedAt: "2026-09-03T21:00:00.000Z",
      messages: [
        { id: "u-old", role: "user", content: "old", at: "1:00 PM" },
        { id: "a-old", role: "assistant", content: "old reply", at: "1:00 PM" },
        { id: "u-old2", role: "user", content: "older", at: "1:01 PM" },
      ],
    });

    const merged = mergeHydratedThread(local, remote);
    assert.equal(merged.messages.length, 2);
    assert.equal(merged.messages[0]?.id, "u-new");
  });

  it("restores user_connector blocks from getThread after light list hydrate", () => {
    const stamp = "2026-09-03T21:07:17.226Z";
    const light = thread({
      id: "t-u2k7sg",
      updatedAt: stamp,
      messages: [
        {
          id: "u-amy",
          role: "user",
          content: "Go ahead. My Gmail again and see if I had an email from Amy",
          at: "3:05 PM",
        },
        {
          id: "a-amy",
          role: "assistant",
          content: "Yes — Amy emailed.",
          at: "3:05 PM",
        },
      ],
    });
    const full = thread({
      id: "t-u2k7sg",
      updatedAt: stamp,
      messages: [
        {
          id: "u-amy",
          role: "user",
          content: "Go ahead. My Gmail again and see if I had an email from Amy",
          at: "3:05 PM",
          blocks: [
            {
              type: "user_connector",
              connectionId: "conn_gmail",
              connectorId: "gmail",
              label: "Gmail",
            },
          ],
        },
        {
          id: "a-amy",
          role: "assistant",
          content: "Yes — Amy emailed.",
          at: "3:05 PM",
        },
      ],
    });

    const merged = mergeHydratedThread(light, full);
    const blocks = merged.messages[0]?.blocks;
    assert.ok(blocks?.some((b) => b.type === "user_connector"));
    assert.equal(
      blocks?.find((b) => b.type === "user_connector" && "label" in b)?.label,
      "Gmail",
    );
  });

  it("keeps local user_connector chips when remote light-load has no blocks", () => {
    const local = thread({
      id: "t-1",
      updatedAt: "2026-09-03T21:00:05.000Z",
      messages: [
        {
          id: "u-1",
          role: "user",
          content: "Check Gmail",
          at: "1:00 PM",
          blocks: [
            {
              type: "user_connector",
              connectionId: "conn_1",
              connectorId: "gmail",
              label: "Gmail",
            },
          ],
        },
        { id: "a-1", role: "assistant", content: "ok", at: "1:00 PM" },
        { id: "u-2", role: "user", content: "thanks", at: "1:01 PM" },
      ],
    });
    const remote = thread({
      id: "t-1",
      updatedAt: "2026-09-03T21:00:00.000Z",
      messages: [
        {
          id: "u-1",
          role: "user",
          content: "Check Gmail",
          at: "1:00 PM",
        },
        { id: "a-1", role: "assistant", content: "ok", at: "1:00 PM" },
      ],
    });

    const merged = mergeHydratedThread(local, remote);
    assert.equal(merged.messages.length, 3);
    assert.ok(
      merged.messages[0]?.blocks?.some((b) => b.type === "user_connector"),
    );
  });
});
