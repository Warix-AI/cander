/**
 * In-memory ConversationTurnState per UI thread (local FM path).
 * Not durable DB memory — Edge conversation_state remains separate for now.
 */

import {
  emptyConversationTurnState,
  type ConversationTurnState,
} from "./conversation-types.ts";

const byThread = new Map<string, ConversationTurnState>();

export function getConversationTurnState(
  threadId: string | null | undefined,
): ConversationTurnState {
  if (!threadId) return emptyConversationTurnState();
  return byThread.get(threadId) ?? emptyConversationTurnState();
}

export function setConversationTurnState(
  threadId: string | null | undefined,
  state: ConversationTurnState,
): void {
  if (!threadId) return;
  byThread.set(threadId, state);
}

export function clearConversationTurnState(
  threadId: string | null | undefined,
): void {
  if (!threadId) return;
  byThread.delete(threadId);
}
