/**
 * Continuous workspace chat — one left session across spaces; projects stay separate.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  continuousChatId,
  ensureContinuousChat,
  findContinuousChat,
  projectChatId,
  startContinuousChat,
  upsertPersistentProjectThread,
} from "../lib/persistent-chat.ts";

describe("continuous chat across spaces", () => {
  it("keeps one session when switching spaces", () => {
    const first = ensureContinuousChat([], "ws1", "work");
    assert.equal(first.id, continuousChatId("ws1"));
    const again = ensureContinuousChat(first.threads, "ws1", "build", first.id);
    assert.equal(again.id, first.id);
    const t = findContinuousChat(again.threads, "ws1");
    assert.equal(t?.spaceId, "build");
    assert.equal(again.threads.filter((x) => !x.projectId).length, 1);
  });

  it("new chat mints a distinct session id", () => {
    const a = startContinuousChat([], "ws1", "work");
    const b = startContinuousChat(a.threads, "ws1", "research");
    assert.notEqual(a.id, b.id);
    assert.ok(b.id.startsWith("t-session-ws1-"));
  });

  it("projects keep their own docks", () => {
    const session = ensureContinuousChat([], "ws1", "build");
    const project = upsertPersistentProjectThread(
      session.threads,
      "ws1",
      "proj1",
      "build",
    );
    assert.equal(project.id, projectChatId("ws1", "proj1"));
    assert.notEqual(project.id, session.id);
    const back = ensureContinuousChat(project.threads, "ws1", "build", session.id);
    assert.equal(back.id, session.id);
  });
});
