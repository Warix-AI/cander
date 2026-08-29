/**
 * Token-budget context builder — client mirror for tests.
 * Keep in sync with supabase/functions/_shared/agent/context-builder.ts
 */

import { isInternalResultBlob } from "./router.ts";

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / CHARS_PER_TOKEN);
}

export type HistoryMessage = {
  id?: string;
  role: string;
  content: string;
};

export type ContextBuildResult = {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
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

export function buildContext(input: {
  systemPrompt: string;
  conversationState?: Record<string, unknown> | null;
  retrievedHistory?: HistoryMessage[];
  searchEventsText?: string;
  recentMessages: HistoryMessage[];
  maxContextTokens: number;
}): ContextBuildResult {
  const messages: ContextBuildResult["messages"] = [];
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
  const budgetHead = Math.max(800, input.maxContextTokens - reserveForRecent);

  messages.push({ role: "system", content: input.systemPrompt });
  used += estimateTokens(input.systemPrompt);
  counts.system++;

  if (input.conversationState && Object.keys(input.conversationState).length) {
    const stateText = `Conversation state:\n${JSON.stringify(input.conversationState)}`;
    if (used + estimateTokens(stateText) < budgetHead) {
      messages.push({ role: "system", content: stateText });
      used += estimateTokens(stateText);
      counts.state++;
    }
  }

  for (const m of input.retrievedHistory ?? []) {
    if (m.role === "system" || isInternalResultBlob(m.content)) continue;
    const cost = estimateTokens(m.content) + 4;
    if (used + cost > budgetHead) break;
    messages.push({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    });
    used += cost;
    counts.retrieved++;
  }

  if (input.searchEventsText?.trim()) {
    const t = `Retrieved sources:\n${input.searchEventsText.trim()}`;
    if (used + estimateTokens(t) < budgetHead) {
      messages.push({ role: "system", content: t });
      used += estimateTokens(t);
      counts.events++;
    }
  }

  const recent = (input.recentMessages ?? []).filter(
    (m) => m.role !== "system" && !isInternalResultBlob(m.content),
  );
  const recentIds: string[] = [];
  const packed: ContextBuildResult["messages"] = [];
  let recentTokens = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    const cost = estimateTokens(m.content) + 4;
    if (recentTokens + cost > reserveForRecent && packed.length > 0) break;
    if (
      used + recentTokens + cost > input.maxContextTokens &&
      packed.length > 0
    ) {
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

  return { messages, tokenEstimate: used, counts, recentIds };
}
