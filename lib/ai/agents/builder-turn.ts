/**
 * Agent Builder chat turns — OpenAI decides tools; client executes agent.* mutations.
 * Same pattern as Gmail connector turns: tools never run on the server blindly.
 */

import type {
  AgentTurnOptions,
  AgentTurnResult,
} from "@/lib/ai/runtime/agent-turn";
import { runRawOpenAITurn } from "@/lib/ai/raw-openai/run-turn";
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
import { TOOL_DOMAINS } from "@/lib/ai/tools/domains";
import { labelForAgentTool } from "@/lib/ai/agents/labels";

const MAX_ROUNDS = 8;

const AGENT_BUILDER_INSTRUCTIONS = `You are helping the user build and modify an Agent in Cander (automations / workflows).

The right panel is the live Agent Builder. You construct and edit it ONLY through the agent.* tools listed below — never invent raw workflow JSON for the user to paste, and never claim you changed the agent unless a tool succeeded.

How to work:
1. Call agent.get when you need the current name, instructions, steps, connector access, skills, or knowledge.
2. Mutate with agent.step.add / update / delete / set_enabled, agent.update_metadata, agent.tools.grant / revoke, agent.skill.*, agent.knowledge.*, and agent.validate.
3. Prefer small progressive edits so steps appear one at a time in the builder.
4. After tools run, reply in plain language about what changed. Keep the human sentence short; put the tool JSON on its own final line when acting.
5. If a tool fails (missing access, invalid stepId, etc.), explain the error and how to fix it conversationally.
6. Step kinds: trigger, condition, action, wait, branch. Use stepIds from agent.get when updating or deleting.

Examples of requests you should handle with tools:
- "Whenever the form is submitted, add them to HubSpot and email them"
- "Wait 2 days then Slack me if they haven't replied"
- "Delete the HubSpot step"
- "Don't let it send emails anymore"
- "What does this agent have access to?"
- "Validate this workflow"`;

function agentToolNames(): string[] {
  return [...TOOL_DOMAINS.agent];
}

function formatToolResultsNote(results: AiToolCallResult[]): string {
  return results
    .map(
      (r) =>
        `Tool ${r.name} (${r.ok ? "ok" : "failed"}):\n${r.output}`,
    )
    .join("\n\n");
}

export async function runAgentBuilderTurn(
  request: AiGenerateRequest,
  opts?: AgentTurnOptions,
): Promise<AgentTurnResult> {
  const report = opts?.onProgress ?? (() => {});
  const allowedTools = agentToolNames();
  const toolResults: AiToolCallResult[] = [];

  report({
    phase: "thinking",
    label: "Thinking",
    detail: "Inspecting agent…",
  });

  let working: AiGenerateRequest = {
    ...request,
    allowTools: true,
    allowedToolNames: allowedTools,
    toolContext: [
      formatToolsForPrompt(allowedTools),
      AGENT_BUILDER_INSTRUCTIONS,
      request.agentId
        ? `Active agentId for this project: ${request.agentId}`
        : "Resolve the agent via tools (omit agentId to use the project's primary agent).",
    ].join("\n\n"),
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (opts?.signal?.aborted) {
      return {
        content: "",
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
        toolResults: toolResults.length ? toolResults : undefined,
      };
    }

    if (round > 0) {
      report({
        phase: "follow_up",
        label: "Thinking",
        detail: "Updating agent…",
        contentStreaming: true,
      });
    }

    const generated = await runRawOpenAITurn(working, {
      ...opts,
      suppressContentDelta: round > 0,
    });
    const { text, call } = parseToolCallFromContent(generated.content);

    if (round === 0) {
      const ack = sanitizeAssistantVisibleText(text || "").trim();
      if (ack) {
        report({
          phase: "generating",
          label: "Thinking",
          detail: "Building agent…",
          contentDelta: ack,
          contentStreaming: true,
        });
      }
    }

    let toolCall = call;
    if (toolCall && !allowedTools.includes(toolCall.name)) {
      toolCall = null;
    }
    if (toolCall && !toolCall.name.startsWith("agent.")) {
      toolCall = null;
    }

    if (!toolCall) {
      const content =
        sanitizeAssistantVisibleText(text || generated.content).trim() ||
        (toolResults.length
          ? "Done — check the Agent Builder on the right for the latest workflow."
          : generated.content);
      return {
        ...generated,
        content,
        toolResults: toolResults.length ? toolResults : undefined,
      };
    }

    const humanLabel = labelForAgentTool(toolCall.name);
    report({
      phase: "tool",
      label: "Thinking",
      detail: humanLabel,
      toolName: toolCall.name,
      contentStreaming: true,
    });

    const result = await executeAuthorizedTool({
      name: toolCall.name,
      arguments: {
        ...(toolCall.arguments ?? {}),
        ...(request.agentId && !toolCall.arguments?.agentId
          ? { agentId: request.agentId }
          : {}),
      },
    });
    toolResults.push(result);

    report({
      phase: "follow_up",
      label: "Thinking",
      detail: humanLabel,
      toolName: toolCall.name,
      toolOk: result.ok,
      contentStreaming: true,
    });

    working = {
      ...working,
      toolContext: [
        formatToolsForPrompt(allowedTools),
        AGENT_BUILDER_INSTRUCTIONS,
        formatToolResultsNote(toolResults),
        result.ok
          ? "Continue with the next mutation if needed, or finish with a short plain-language summary. Do not repeat successful tool JSON."
          : "The last tool failed — explain the problem and either fix it with another tool or ask the user.",
      ].join("\n\n"),
      messages: [
        ...(request.messages ?? []),
        { role: "user", content: request.content },
        ...(round === 0 && generated.content
          ? [{ role: "assistant" as const, content: generated.content }]
          : []),
      ],
      content: [
        request.content,
        "",
        "Continue building or editing the agent using tools if more changes are needed. Otherwise summarize what changed for the user.",
      ].join("\n"),
    };
  }

  const summary = await runRawOpenAITurn(
    {
      ...working,
      allowTools: false,
      allowedToolNames: [],
      content: [
        request.content,
        "",
        "Summarize what you changed on the agent in plain language. Do not emit tool JSON.",
      ].join("\n"),
    },
    { ...opts, suppressContentDelta: true },
  );

  return {
    ...summary,
    content:
      sanitizeAssistantVisibleText(summary.content).trim() ||
      "Updated the agent — see the builder on the right.",
    toolResults: toolResults.length ? toolResults : undefined,
  };
}
