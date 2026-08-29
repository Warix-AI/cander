/**
 * Token-budget ContextBuilder — newest turns always protected.
 */

import type {
  ConversationState,
  ModelMessage,
  RetrievalSource,
} from "./types.ts";
import { isInternalResultBlob } from "./types.ts";

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / CHARS_PER_TOKEN);
}

export type HistoryMessage = {
  id?: string;
  role: string;
  content: string;
  sort_order?: number;
};

export type ContextBuildInput = {
  systemPrompt: string;
  conversationState?: ConversationState | null;
  retrievedHistory?: HistoryMessage[];
  searchEventsText?: string;
  sources?: RetrievalSource[];
  recentMessages: HistoryMessage[];
  maxContextTokens: number;
  userProfileText?: string | null;
  workspaceContextText?: string | null;
};

export type ContextBuildResult = {
  messages: ModelMessage[];
  tokenEstimate: number;
  counts: {
    system: number;
    state: number;
    retrieved: number;
    events: number;
    recent: number;
  };
  recentIds: string[];
};

function pushSystem(
  out: ModelMessage[],
  content: string | null | undefined,
): number {
  const t = (content ?? "").trim();
  if (!t) return 0;
  out.push({ role: "system", content: t });
  return estimateTokens(t);
}

export function buildContext(input: ContextBuildInput): ContextBuildResult {
  const messages: ModelMessage[] = [];
  let used = 0;
  const counts = {
    system: 0,
    state: 0,
    retrieved: 0,
    events: 0,
    recent: 0,
  };

  const reserveForRecent = Math.min(
    Math.floor(input.maxContextTokens * 0.45),
    3500,
  );
  const budgetHead = Math.max(
    800,
    input.maxContextTokens - reserveForRecent,
  );

  used += pushSystem(messages, input.systemPrompt);
  counts.system++;

  if (input.userProfileText) {
    used += pushSystem(messages, input.userProfileText);
    counts.system++;
  }
  if (input.workspaceContextText) {
    used += pushSystem(messages, input.workspaceContextText);
    counts.system++;
  }

  if (input.conversationState && Object.keys(input.conversationState).length) {
    const stateText = `Conversation state (structured):\n${JSON.stringify(input.conversationState)}`;
    if (used + estimateTokens(stateText) < budgetHead) {
      used += pushSystem(messages, stateText);
      counts.state++;
    }
  }

  for (const m of input.retrievedHistory ?? []) {
    if (m.role === "system") continue;
    if (isInternalResultBlob(m.content)) continue;
    const content =
      m.role === "assistant"
        ? m.content
        : m.content;
    const cost = estimateTokens(content) + 4;
    if (used + cost > budgetHead) break;
    messages.push({
      role: m.role === "assistant" ? "assistant" : "user",
      content,
    });
    used += cost;
    counts.retrieved++;
  }

  if (input.searchEventsText?.trim()) {
    const t = `Retrieved sources / tool events for this turn:\n${input.searchEventsText.trim()}`;
    if (used + estimateTokens(t) < budgetHead) {
      used += pushSystem(messages, t);
      counts.events++;
    }
  }

  if (input.sources?.length) {
    const lines = input.sources.map(
      (s) =>
        `- [${s.id}] ${s.title}${s.url ? ` (${s.url})` : ""}${
          s.snippet ? `: ${s.snippet.slice(0, 240)}` : ""
        }`,
    );
    const t = `Cite only these source IDs when attributing facts:\n${lines.join("\n")}`;
    if (used + estimateTokens(t) < input.maxContextTokens) {
      used += pushSystem(messages, t);
      counts.events++;
    }
  }

  // Newest verbatim turns fill remaining budget — never condensed away
  const recent = (input.recentMessages ?? []).filter(
    (m) => m.role !== "system" && !isInternalResultBlob(m.content),
  );
  const recentIds: string[] = [];
  const packed: ModelMessage[] = [];
  let recentTokens = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    const cost = estimateTokens(m.content) + 4;
    if (recentTokens + cost > reserveForRecent && packed.length > 0) break;
    if (used + recentTokens + cost > input.maxContextTokens && packed.length > 0) {
      break;
    }
    packed.unshift({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    });
    recentTokens += cost;
    if (m.id) recentIds.unshift(m.id);
    counts.recent++;
  }
  messages.push(...packed);
  used += recentTokens;

  return {
    messages,
    tokenEstimate: used,
    counts,
    recentIds,
  };
}

export function logContextBuild(meta: {
  turnId: string;
  chatId: string;
  tokenEstimate: number;
  counts: ContextBuildResult["counts"];
  recentIds: string[];
  sourceIds?: string[];
}): void {
  console.log("[CONTEXT_BUILD]", {
    turnId: meta.turnId,
    chatId: meta.chatId,
    tokenEstimate: meta.tokenEstimate,
    counts: meta.counts,
    recentIdCount: meta.recentIds.length,
    sourceIdCount: meta.sourceIds?.length ?? 0,
  });
}
