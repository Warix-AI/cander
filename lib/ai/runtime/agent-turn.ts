/**
 * Lightweight agent loop: generate → parse tool call → execute → optional re-generate.
 * Clarification / confirm tools pause for the user.
 *
 * Tool catalogs are injected by providers/instructions — not appended to the
 * user message that cloud persists in ai_chat_messages.
 */

import {
  executeAuthorizedTool,
  parseToolCallFromContent,
  type AiToolCallResult,
} from "@/lib/ai/runtime/tools";
import { generateWithAiRuntime } from "@/lib/ai/runtime/runtime";
import type {
  AiGenerateRequest,
  AiGenerateResult,
} from "@/lib/ai/runtime/types";

const MAX_TOOL_ROUNDS = 3;

export type AgentTurnResult = AiGenerateResult & {
  toolResults?: AiToolCallResult[];
  pausedForUser?: boolean;
};

export async function runAssistantTurn(
  request: AiGenerateRequest,
): Promise<AgentTurnResult> {
  const toolResults: AiToolCallResult[] = [];
  let working: AiGenerateRequest = { ...request };
  let last: AiGenerateResult | null = null;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    last = await generateWithAiRuntime(working);
    const { text, call } = parseToolCallFromContent(last.content);
    if (!call) {
      return {
        ...last,
        content: text || last.content,
        toolResults: toolResults.length ? toolResults : undefined,
      };
    }

    const result = await executeAuthorizedTool(call);
    toolResults.push(result);

    if (result.pauseForUser) {
      return {
        ...last,
        content:
          text.trim() ||
          (call.name === "ui.ask_clarification"
            ? "I need a few details — fill in the card above the message box."
            : "Please confirm to continue."),
        toolResults,
        pausedForUser: true,
      };
    }

    const followUp = [
      `Tool ${result.name} result: ${result.ok ? "ok" : "error"} — ${result.output}`,
      "Continue the task for the user. Call another tool only if still needed; otherwise reply normally.",
    ].join("\n");

    working = {
      ...request,
      content: followUp,
      messages: [
        ...(request.messages ?? []),
        { role: "user", content: request.content },
        { role: "assistant", content: text || last.content },
        {
          role: "user",
          content: followUp,
        },
      ],
    };
  }

  return {
    ...(last as AiGenerateResult),
    content: last?.content ?? "I hit the tool-step limit — try again.",
    toolResults,
  };
}
