/**
 * Gmail connector turns — tool loop for comms domain (bypasses V6 surface pipeline).
 */

import type {
  AgentTurnOptions,
  AgentTurnResult,
} from "@/lib/ai/runtime/agent-turn";
import { generateWithAiRuntime } from "@/lib/ai/runtime/runtime";
import {
  executeAuthorizedTool,
  formatToolsForPrompt,
  type AiToolCallResult,
} from "@/lib/ai/runtime/tools";
import type { AiGenerateRequest } from "@/lib/ai/runtime/types";
import {
  parseToolCallFromContent,
  sanitizeAssistantVisibleText,
} from "@/lib/ai/tool-protocol";

const COMMS_TOOLS = ["gmail.search", "gmail.read"] as const;
const MAX_ROUNDS = 3;

export async function runCommsConnectorTurn(
  request: AiGenerateRequest,
  opts?: AgentTurnOptions,
): Promise<AgentTurnResult> {
  const report = opts?.onProgress ?? (() => {});
  report({
    phase: "thinking",
    label: "Thinking",
    detail: "Checking Gmail…",
  });

  const toolResults: AiToolCallResult[] = [];
  let working: AiGenerateRequest = {
    ...request,
    allowTools: true,
    allowedToolNames: [...COMMS_TOOLS],
    toolContext: formatToolsForPrompt([...COMMS_TOOLS]),
    preferredRoute: "cander_cloud",
    routingReason: "gmail_connector",
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (round > 0) {
      report({ phase: "follow_up", label: "Thinking", detail: "Using Gmail…" });
    }
    const generated = await generateWithAiRuntime(working);
    const { text, call } = parseToolCallFromContent(generated.content);

    if (
      !call ||
      !COMMS_TOOLS.includes(call.name as (typeof COMMS_TOOLS)[number])
    ) {
      const content =
        sanitizeAssistantVisibleText(text || generated.content).trim() ||
        "I couldn't complete that Gmail request.";
      return {
        ...generated,
        content,
        toolResults: toolResults.length ? toolResults : undefined,
      };
    }

    report({
      phase: "tool",
      label: "Thinking",
      detail: call.name === "gmail.read" ? "Reading email…" : "Searching Gmail…",
      toolName: call.name,
    });
    const result = await executeAuthorizedTool(call);
    toolResults.push(result);

    const toolNote = `Tool ${call.name} (${result.ok ? "ok" : "failed"}):\n${result.output}`;
    working = {
      ...working,
      allowTools: true,
      allowedToolNames: [...COMMS_TOOLS],
      toolContext: [working.toolContext, toolNote].filter(Boolean).join("\n\n"),
      messages: [
        ...(request.messages ?? []),
        { role: "user", content: request.content },
        { role: "assistant", content: generated.content },
      ],
    };
  }

  const summary = await generateWithAiRuntime({
    ...working,
    allowTools: false,
    allowedToolNames: [],
    content: [
      request.content,
      "",
      "Use the Gmail tool results above. Answer in plain language.",
    ].join("\n"),
  });

  return {
    ...summary,
    content:
      sanitizeAssistantVisibleText(summary.content).trim() ||
      toolResults.map((t) => t.output).join("\n\n"),
    toolResults,
  };
}
