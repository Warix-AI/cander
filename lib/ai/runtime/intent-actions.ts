/**
 * High-confidence client intents — run before the model so Cloud/Apple behave the same.
 */

import type { ClarificationQuestion } from "@/lib/ai/clarification/schema";
import { CREATE_PROJECT_SPACE_QUESTIONS } from "@/lib/ai/clarification/schema";
import { getAppActionHandlers } from "@/lib/ai/runtime/app-actions";
import {
  matchCreateProjectIntent,
  matchNavIntent,
} from "@/lib/ai/runtime/intent-matchers";
import { executeAuthorizedTool } from "@/lib/ai/runtime/tools";
import type { AiToolCallResult } from "@/lib/ai/runtime/tools";

export type IntentShortcutResult = {
  content: string;
  toolResults: AiToolCallResult[];
  pausedForUser?: boolean;
};

export { matchCreateProjectIntent, matchNavIntent };

export function buildCreateProjectClarification(opts: {
  threadId: string;
  title?: string | null;
}): { opened: boolean; detail: string } {
  const actions = getAppActionHandlers();
  if (!actions) return { opened: false, detail: "App actions unavailable." };

  const questions: ClarificationQuestion[] = [
    CREATE_PROJECT_SPACE_QUESTIONS[0]!,
  ];
  if (!opts.title?.trim()) {
    questions.push(CREATE_PROJECT_SPACE_QUESTIONS[1]!);
  }

  const result = actions.askClarification({
    threadId: opts.threadId,
    title: "New project",
    description: opts.title?.trim()
      ? `We’ll create “${opts.title.trim()}” once you pick a space.`
      : "Pick a space, then give it a name.",
    questions,
    resumeTool: "project.create",
    resumeArguments: opts.title?.trim()
      ? { title: opts.title.trim() }
      : {},
  });
  return { opened: result.ok, detail: result.detail };
}

/**
 * If the user message is a high-confidence nav or create intent, handle it
 * without calling the model.
 */
export async function tryIntentShortcut(
  content: string,
  opts: { threadId?: string | null },
): Promise<IntentShortcutResult | null> {
  const nav = matchNavIntent(content);
  if (nav) {
    const result = await executeAuthorizedTool({
      name: "nav.open",
      arguments: { target: nav.target },
    });
    return {
      content: result.ok
        ? `Opening ${nav.label}.`
        : result.output || `Couldn't open ${nav.label}.`,
      toolResults: [result],
    };
  }

  const create = matchCreateProjectIntent(content);
  if (create && opts.threadId) {
    const card = buildCreateProjectClarification({
      threadId: opts.threadId,
      title: create.title,
    });
    if (card.opened) {
      return {
        content: create.title
          ? `Got it — “${create.title}”. Which space should it live in?`
          : "Sure — what space should this project live in, and what should we name it?",
        toolResults: [
          {
            name: "ui.ask_clarification",
            ok: true,
            output: card.detail,
            pauseForUser: true,
          },
        ],
        pausedForUser: true,
      };
    }
  }

  return null;
}
