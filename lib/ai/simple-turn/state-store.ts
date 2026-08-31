/**
 * Per-thread SimpleState — adapts conversation-store notes.
 */

import {
  getConversationTurnState,
  setConversationTurnState,
} from "../turn-environment/conversation-store.ts";
import type { ConversationTurnState } from "../turn-environment/conversation-types.ts";
import { resolveBrowserMode } from "./browser-policy.ts";
import type {
  CommitNotes,
  SimpleAttachment,
  SimpleEvidence,
  SimpleState,
} from "./types.ts";

const cacheByThread = new Map<string, Map<string, SimpleEvidence>>();
const notesByThread = new Map<string, CommitNotes>();

function emptyNotes(): CommitNotes {
  return { entities: [], facts: [] };
}

function notesFromConversation(conv: ConversationTurnState): CommitNotes {
  const topic =
    conv.topics.find((t) => t.contextClass === "ACTIVE")?.label ??
    conv.topics[0]?.label;
  const entities = conv.entities
    .filter((e) => e.contextClass !== "EXPIRED")
    .map((e) => e.label)
    .slice(0, 5);
  return {
    topic,
    entities,
    facts: [],
  };
}

function syncNotesToConversation(
  threadId: string,
  notes: CommitNotes,
  conv: ConversationTurnState,
): void {
  const next: ConversationTurnState = {
    ...conv,
    currentIntent: notes.topic ?? conv.currentIntent,
    topics: notes.topic
      ? [
          {
            id: `topic_simple`,
            label: notes.topic,
            contextClass: "ACTIVE",
          },
          ...conv.topics
            .filter((t) => t.label !== notes.topic)
            .map((t) => ({ ...t, contextClass: "AVAILABLE" as const }))
            .slice(0, 4),
        ]
      : conv.topics,
    entities: [
      ...notes.entities.map((label, i) => ({
        id: `ent_simple_${i}`,
        type: "entity",
        label,
        contextClass: "ACTIVE" as const,
      })),
      ...conv.entities
        .filter((e) => !notes.entities.includes(e.label))
        .slice(0, 3)
        .map((e) => ({ ...e, contextClass: "AVAILABLE" as const })),
    ].slice(0, 8),
  };
  setConversationTurnState(threadId, next);
}

export function loadSimpleState(opts: {
  threadId?: string | null;
  text: string;
  attachments?: SimpleAttachment[];
  browser?: SimpleState["browser"];
  tz?: string;
}): SimpleState {
  const threadId = opts.threadId ?? "anonymous";
  const conv = getConversationTurnState(opts.threadId);
  const stored = notesByThread.get(threadId);
  const fromConv = notesFromConversation(conv);
  const notes: CommitNotes = {
    topic: stored?.topic ?? fromConv.topic,
    entities: (stored?.entities?.length ? stored.entities : fromConv.entities).slice(
      0,
      5,
    ),
    facts: (stored?.facts ?? []).slice(0, 5),
  };

  let cache = cacheByThread.get(threadId);
  if (!cache) {
    cache = new Map();
    cacheByThread.set(threadId, cache);
  }

  const tz =
    opts.tz ||
    (typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC");
  const now = new Date();
  const date = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: tz,
  });

  return {
    text: opts.text,
    attachments: opts.attachments ?? [],
    browser: resolveBrowserMode({ preferred: opts.browser }),
    now: { date, tz },
    notes,
    cache,
  };
}

export function commitSimpleNotes(
  threadId: string | null | undefined,
  notes: CommitNotes,
): void {
  if (!threadId) return;
  const trimmed: CommitNotes = {
    topic: notes.topic?.slice(0, 80),
    entities: notes.entities.slice(0, 5),
    facts: notes.facts.slice(0, 5).map((f) => f.slice(0, 160)),
  };
  notesByThread.set(threadId, trimmed);
  const conv = getConversationTurnState(threadId);
  syncNotesToConversation(threadId, trimmed, conv);
}

export function resetSimpleStateForTests(): void {
  cacheByThread.clear();
  notesByThread.clear();
}

export function cacheKey(cap: string, q: string): string {
  return `${cap}::${q.trim().toLowerCase().slice(0, 200)}`;
}
