/**
 * Build web.search arguments from TurnTask + user content.
 * Shared by compiler and orchestrator escalation retries.
 */

import type { TurnTaskResolution } from "./turn-task.ts";
import type { ConversationTurnState } from "./conversation-types.ts";
import {
  buildRetrievalQuery,
  type TurnRetrievalHints,
} from "../../../supabase/functions/_shared/web-research-contract/retrieval-policy.ts";

export function turnTaskToRetrievalHints(
  turnTask: TurnTaskResolution,
  conv?: ConversationTurnState | null,
): TurnRetrievalHints {
  return {
    subject: turnTask.subject,
    operation: turnTask.operation,
    requestedFields: turnTask.requestedFields,
    requestedItemCount: turnTask.requestedItemCount,
    freshness: turnTask.freshness || Boolean(conv?.freshnessRequirement),
    depth: turnTask.depth,
    presentation: turnTask.presentation,
    dissatisfaction: Boolean(conv?.dissatisfactionSignal),
  };
}

export function webSearchArguments(opts: {
  content: string;
  turnTask: TurnTaskResolution;
  conv?: ConversationTurnState | null;
  query?: string;
  escalate?: string;
  deeper?: boolean;
}): Record<string, unknown> {
  const hints = turnTaskToRetrievalHints(opts.turnTask, opts.conv);
  const query =
    opts.query ??
    buildRetrievalQuery({
      content: opts.content,
      subject: opts.turnTask.subject,
      requestedFields: opts.turnTask.requestedFields,
      operation: opts.turnTask.operation,
    });
  return {
    query,
    retrievalHints: hints,
    ...(opts.escalate ? { escalate: opts.escalate } : {}),
    ...(opts.deeper ? { deeper: true } : {}),
  };
}

export function enrichPreRunWebSearchTasks(
  tasks: Array<{ name: string; arguments: Record<string, unknown>; reason: string }>,
  opts: {
    content: string;
    turnTask: TurnTaskResolution;
    conv?: ConversationTurnState | null;
  },
): Array<{ name: string; arguments: Record<string, unknown>; reason: string }> {
  return tasks.map((task) => {
    if (task.name !== "web.search") return task;
    const existingQuery = String(task.arguments.query ?? "").trim();
    return {
      ...task,
      arguments: webSearchArguments({
        content: opts.content,
        turnTask: opts.turnTask,
        conv: opts.conv,
        query: existingQuery || undefined,
      }),
    };
  });
}
