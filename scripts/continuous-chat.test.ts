/**
 * Shared space default chat, detached New Chat, and Recents attachment rules.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  adoptThreadAsSpaceDefault,
  adoptThreadAsUniversalDefault,
  continuousChatId,
  isDetachedSessionChat,
  isSpaceAttachedChat,
  isUniversalDefaultChat,
  openSpaceDefaultChat,
  projectChatId,
  spaceChatId,
  startContinuousChat,
  upsertPersistentProjectThread,
} from "../lib/persistent-chat.ts";

describe("shared space default chats", () => {
  it("work/build/research/studio resume the same universal default chat", () => {
    const work = openSpaceDefaultChat([], "ws1", "work");
    const build = openSpaceDefaultChat(work.threads, "ws1", "build");
    const research = openSpaceDefaultChat(build.threads, "ws1", "research");
    const studio = openSpaceDefaultChat(research.threads, "ws1", "studio");
    const defaultId = continuousChatId("ws1");
    assert.equal(work.id, defaultId);
    assert.equal(build.id, defaultId);
    assert.equal(research.id, defaultId);
    assert.equal(studio.id, defaultId);
    assert.equal(
      studio.threads.filter((t) => t.id === defaultId).length,
      1,
    );
    assert.equal(
      studio.threads.find((t) => t.id === defaultId)?.spaceId,
      "studio",
    );
  });

  it("new chat session stays detached with no spaceId until promoted", () => {
    const draft = startContinuousChat([], "ws1", null);
    assert.equal("spaceId" in (draft.threads[0] ?? {}) && draft.threads[0]?.spaceId != null, false);
    assert.equal(isDetachedSessionChat(draft.threads[0], "ws1"), true);
    assert.equal(isSpaceAttachedChat(draft.threads[0], "ws1"), false);

    const buildDefault = openSpaceDefaultChat(draft.threads, "ws1", "build");
    assert.notEqual(draft.id, buildDefault.id);
    assert.equal(buildDefault.id, continuousChatId("ws1"));
    // Detached draft is unchanged and still unattached.
    assert.equal(
      buildDefault.threads.find((t) => t.id === draft.id)?.spaceId,
      undefined,
    );
  });

  it("Default chat promotes a draft into the universal slot", () => {
    const draft = startContinuousChat([], "ws1", null);
    const promoted = adoptThreadAsUniversalDefault(
      draft.threads,
      "ws1",
      draft.id,
    );
    assert.equal(promoted.id, continuousChatId("ws1"));
    assert.equal(isUniversalDefaultChat(
      promoted.threads.find((t) => t.id === promoted.id),
      "ws1",
    ), true);
    assert.equal(promoted.threads.some((t) => t.id === draft.id), false);
    assert.ok(promoted.removedIds.includes(draft.id));
  });

  it("Default chat replaces a prior universal default for all spaces", () => {
    const prior = openSpaceDefaultChat([], "ws1", "work");
    const withPrior = prior.threads.map((t) =>
      t.id === prior.id
        ? {
            ...t,
            messages: [
              {
                id: "u1",
                role: "user" as const,
                content: "old chat",
                at: "12:00",
              },
            ],
            snippet: "old chat",
          }
        : t,
    );
    const draft = startContinuousChat(withPrior, "ws1", null);
    const trip = draft.threads.map((t) =>
      t.id === draft.id
        ? {
            ...t,
            messages: [
              {
                id: "u2",
                role: "user" as const,
                content: "plan a trip",
                at: "12:01",
              },
            ],
            snippet: "plan a trip",
          }
        : t,
    );
    const promoted = adoptThreadAsUniversalDefault(trip, "ws1", draft.id);
    const work = openSpaceDefaultChat(promoted.threads, "ws1", "work");
    const explore = openSpaceDefaultChat(work.threads, "ws1", "research");
    const build = openSpaceDefaultChat(explore.threads, "ws1", "build");
    assert.equal(work.id, continuousChatId("ws1"));
    assert.equal(explore.id, continuousChatId("ws1"));
    assert.equal(build.id, continuousChatId("ws1"));
    assert.equal(
      build.threads.find((t) => t.id === build.id)?.snippet,
      "plan a trip",
    );
    const messages =
      build.threads.find((t) => t.id === build.id)?.messages ?? [];
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.content, "plan a trip");
    assert.equal(
      messages.some((m) => m.content === "old chat"),
      false,
    );
    // Universal slot is replaced in place — not listed for thread delete.
    assert.equal(
      promoted.removedIds.includes(continuousChatId("ws1")),
      false,
    );
    assert.ok(promoted.promoted);
    assert.equal(promoted.promoted?.messages.length, 1);
  });

  it("legacy adoptThreadAsSpaceDefault still replaces a space dock id", () => {
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
    assert.equal(promoted.threads.some((t) => t.id === draft.id), false);
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
    assert.equal(
      isSpaceAttachedChat(project.threads.find((t) => t.id === project.id), "ws1"),
      true,
    );
  });

  it("Recents attachment helpers distinguish detached vs shared vs project", () => {
    const detached = startContinuousChat([], "ws1", null).threads[0]!;
    const shared = openSpaceDefaultChat([], "ws1", "work").threads[0]!;
    const project = upsertPersistentProjectThread([], "ws1", "proj1", "work")
      .threads[0]!;
    const legacy = {
      id: spaceChatId("ws1", "work"),
      title: "Chat",
      workspaceId: "ws1",
      spaceId: "work" as const,
      updatedAt: new Date().toISOString(),
      snippet: "",
      messages: [],
      persistent: true,
      sessionSummary: null,
    };

    assert.equal(isSpaceAttachedChat(detached, "ws1"), false);
    assert.equal(isSpaceAttachedChat(shared, "ws1"), true);
    assert.equal(isSpaceAttachedChat(project, "ws1"), true);
    assert.equal(isSpaceAttachedChat(legacy, "ws1"), true);
  });

  it("HTTP/AppProvider no longer auto-promotes detached drafts on send", () => {
    const src = readFileSync(
      join(process.cwd(), "components/app/AppProvider.tsx"),
      "utf8",
    );
    assert.match(src, /setDraftAsDefaultChat/);
    // Old auto-promote: first unscoped send called adoptThreadAsUniversalDefault.
    assert.equal(
      /detachedDraft[\s\S]{0,200}adoptThreadAsUniversalDefault/.test(src),
      false,
      "sendMessage must not auto-promote detached drafts",
    );
    assert.match(src, /promoteThreadToUniversalDefault/);
    assert.match(
      src,
      /setDraftAsDefaultChat = useCallback\(\s*\([\s\S]*?promoteThreadToUniversalDefault/,
    );
  });
});
