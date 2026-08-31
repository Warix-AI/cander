/**
 * Build web.search arguments from TurnTask + WebRetrievalPlan.
 * Shared by compiler and orchestrator escalation retries.
 */

import type { TurnTaskResolution } from "./turn-task.ts";
import type { ConversationTurnState } from "./conversation-types.ts";
import type { WebRetrievalPlan } from "./web-retrieval-plan.ts";
import {
  buildRetrievalQuery,
  type TurnRetrievalHints,
} from "../../../supabase/functions/_shared/web-research-contract/retrieval-policy.ts";

export function turnTaskToRetrievalHints(
  turnTask: TurnTaskResolution,
  conv?: ConversationTurnState | null,
  carrySubject = true,
): TurnRetrievalHints {
  return {
    subject: carrySubject ? turnTask.subject : null,
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
  webRetrievalPlan?: WebRetrievalPlan;
  query?: string;
  escalate?: string;
  deeper?: boolean;
}): Record<string, unknown> {
  const plan = opts.webRetrievalPlan;
  const carrySubject = plan?.carrySubject ?? opts.turnTask.subject != null;
  const hints = turnTaskToRetrievalHints(opts.turnTask, opts.conv, carrySubject);
  const query =
    opts.query ??
    plan?.query ??
    buildRetrievalQuery({
      content: opts.content,
      subject: opts.turnTask.subject,
      requestedFields: opts.turnTask.requestedFields,
      operation: opts.turnTask.operation,
      carrySubject,
    });
  return {
    query,
    retrievalHints: hints,
    ...(plan
      ? {
          retrievalPlan: {
            mode: plan.mode,
            output: plan.output,
            resultCount: plan.resultCount,
            contentNeeded: plan.contentNeeded,
            domains: plan.domains,
            location: plan.location,
          },
        }
      : {}),
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
    webRetrievalPlan?: WebRetrievalPlan;
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
        webRetrievalPlan: opts.webRetrievalPlan,
        query: existingQuery || undefined,
      }),
    };
  });
}
