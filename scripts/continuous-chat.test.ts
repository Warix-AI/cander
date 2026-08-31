/**
 * Per-space default chats and draft promotion.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  adoptThreadAsSpaceDefault,
  openSpaceDefaultChat,
  projectChatId,
  spaceChatId,
  startContinuousChat,
  upsertPersistentProjectThread,
} from "../lib/persistent-chat.ts";

describe("space default chats", () => {
  it("creates separate defaults per space", () => {
    const work = openSpaceDefaultChat([], "ws1", "work");
    const build = openSpaceDefaultChat(work.threads, "ws1", "build");
    assert.equal(work.id, spaceChatId("ws1", "work"));
    assert.equal(build.id, spaceChatId("ws1", "build"));
    assert.notEqual(work.id, build.id);
    assert.equal(build.threads.filter((t) => !t.projectId).length, 2);
  });

  it("new chat session stays detached until promoted", () => {
    const draft = startContinuousChat([], "ws1", null);
    const buildDefault = openSpaceDefaultChat(draft.threads, "ws1", "build");
    assert.notEqual(draft.id, buildDefault.id);
    assert.equal(
      buildDefault.threads.find((t) => t.id === draft.id)?.spaceId,
      "work",
    );
  });

  it("promotes a draft thread into the space default slot", () => {
    const draft = startContinuousChat([], "ws1", null);
    const promoted = adoptThreadAsSpaceDefault(
      draft.threads,
      "ws1",
      "build",
      draft.id,
    );
    assert.equal(promoted.id, spaceChatId("ws1", "build"));
    assert.equal(
      promoted.threads.find((t) => t.id === spaceChatId("ws1", "build"))?.persistent,
      true,
    );
    assert.equal(
      promoted.threads.some((t) => t.id === draft.id),
      false,
    );
  });

  it("projects keep their own docks", () => {
    const build = openSpaceDefaultChat([], "ws1", "build");
    const project = upsertPersistentProjectThread(
      build.threads,
      "ws1",
      "proj1",
      "build",
    );
    assert.equal(project.id, projectChatId("ws1", "proj1"));
    assert.notEqual(project.id, build.id);
  });
});
