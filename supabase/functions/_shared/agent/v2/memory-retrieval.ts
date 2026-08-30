/**
 * Layered memory retrieval — reference detection, query building, just-in-time assembly.
 */

import type { ConversationWorkingMemory } from "./types.ts";
import type { HistoryRow } from "../history-retriever.ts";

export type ReferenceIntent = {
  /** Pronouns, ordinals, temporal callbacks */
  hasReference: boolean;
  /** Needs older turns from this chat (outside recent window) */
  needsInChatHistory: boolean;
  /** May benefit from other chats in workspace/Space */
  needsCrossChat: boolean;
  /** Follow-up on active entity/topic from working memory */
  entityFollowUp: boolean;
  reasons: string[];
};

export type CrossChatMemoryHit = {
  chatId: string;
  chatTitle: string;
  summary: string;
  snippet: string;
  scope: "chat" | "workspace" | "project" | "owner";
  score: number;
};

export type MemoryRetrievalResult = {
  inChat: HistoryRow[];
  crossChat: CrossChatMemoryHit[];
  queries: string[];
  intent: ReferenceIntent;
};

const PRONOUN_REF =
  /\b(that|this|it|them|those|their|they|he|she|his|her|its)\b/i;
const TEMPORAL_REF =
  /\b(what you said|you mentioned|you told|earlier|before|previously|last time|as you said|still true|is that still|did that change|what was that)\b/i;
const ORDINAL_REF =
  /\b(?:the\s+)?(first|second|third|fourth|fifth|\d+)(?:st|nd|rd|th)?\s+(?:one|item|result|story|article|option|choice|alternative)\b/i;
const CROSS_CHAT_HINT =
  /\b(other chat|another chat|different chat|we discussed|remember when|talked about|mentioned before|in our last|previous conversation)\b/i;

export function detectReferenceIntent(userText: string): ReferenceIntent {
  const t = userText.trim();
  const reasons: string[] = [];
  let hasReference = false;
  let needsInChatHistory = false;
  let needsCrossChat = false;
  let entityFollowUp = false;

  if (PRONOUN_REF.test(t)) {
    hasReference = true;
    needsInChatHistory = true;
    reasons.push("pronoun");
  }
  if (TEMPORAL_REF.test(t)) {
    hasReference = true;
    needsInChatHistory = true;
    reasons.push("temporal");
  }
  if (ORDINAL_REF.test(t)) {
    hasReference = true;
    reasons.push("ordinal");
  }
  if (CROSS_CHAT_HINT.test(t)) {
    hasReference = true;
    needsCrossChat = true;
    needsInChatHistory = true;
    reasons.push("cross_chat_hint");
  }
  // Short follow-ups with possessive often refer to active entity ("their sandbox program")
  if (/\btheir\b/i.test(t) && t.length < 280) {
    hasReference = true;
    entityFollowUp = true;
    needsInChatHistory = true;
    reasons.push("possessive_follow_up");
  }
  // Continuation without explicit entity name but with product/feature terms
  if (
    hasReference &&
    /\b(program|plan|pricing|feature|product|service|setup|how do we|how to)\b/i.test(t)
  ) {
    entityFollowUp = true;
    reasons.push("feature_follow_up");
  }

  return {
    hasReference,
    needsInChatHistory,
    needsCrossChat,
    entityFollowUp,
    reasons,
  };
}

export function buildRetrievalQueries(
  userText: string,
  memory: ConversationWorkingMemory,
  resolvedRef: string | null,
): string[] {
  const queries = new Set<string>();
  const trimmed = userText.trim().slice(0, 200);
  if (trimmed) queries.add(trimmed);

  if (resolvedRef) {
    queries.add(resolvedRef);
    queries.add(`${resolvedRef} ${trimmed}`.slice(0, 200));
  }

  const active = memory.activeEntity ?? memory.entities?.[memory.entities.length - 1];
  if (active) {
    queries.add(active);
    queries.add(`${active} ${trimmed}`.slice(0, 200));
  }

  for (const topic of (memory.topics ?? []).slice(-2)) {
    if (topic.length > 4) queries.add(topic.slice(0, 120));
  }

  for (const ref of (memory.recentReferences ?? []).slice(-2)) {
    queries.add(ref.slice(0, 120));
  }

  return [...queries].slice(0, 6);
}

export function mergeHistoryRows(
  existing: HistoryRow[],
  incoming: HistoryRow[],
  limit = 12,
): HistoryRow[] {
  const seen = new Set(existing.map((r) => r.id));
  const merged = [...existing];
  for (const row of incoming) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  merged.sort((a, b) => a.sort_order - b.sort_order);
  return merged.slice(-limit);
}

export function formatCrossChatForContext(hits: CrossChatMemoryHit[]): string {
  if (!hits.length) return "";
  const blocks = hits.map((h) => {
    const header = `[Other chat: "${h.chatTitle}" (${h.scope})]`;
    const body = h.summary
      ? `Summary: ${h.summary.slice(0, 400)}\nRelevant excerpt: ${h.snippet.slice(0, 600)}`
      : h.snippet.slice(0, 800);
    return `${header}\n${body}`;
  });
  return `Relevant memories from other authorized conversations:\n${blocks.join("\n\n")}`;
}
