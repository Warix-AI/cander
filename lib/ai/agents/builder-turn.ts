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

The right panel is the live Agent Builder for THIS agent. You construct and edit it ONLY through the agent.* tools listed below.
Never invent raw workflow JSON for the user to paste.
Never claim you changed the agent unless a tool succeeded.
Never stop at "I'll set up…" — emit the tool JSON on the same turn.

How to work:
1. Prefer mutating immediately with agent.step.add / update / delete, agent.update_metadata, agent.tools.*, agent.skill.*, agent.knowledge.*, agent.validate.
2. Use agent.get only when you need IDs you don't have yet.
3. Prefer small progressive edits so steps appear one at a time on the right.
4. Keep the human sentence short; put exactly one tool JSON object on its own final line when acting.
5. If a tool fails, explain the error and fix it with another tool or ask the user.
6. Step kinds: trigger, condition, action, wait, branch.

For "email me when someone emails me" / Gmail auto-reply style asks:
- Add a trigger (kind=trigger, label like "Email received", type like "gmail.message_received")
- Then add an action (kind=action, label like "Send Gmail reply", type like "gmail.send" or "gmail.reply")
- Update agent instructions to match

Examples you MUST handle with tools (not prose alone):
- "Whenever the form is submitted, add them to HubSpot and email them"
- "Gmail people when they email me"
- "Wait 2 days then Slack me if they haven't replied"
- "Delete the HubSpot step"
- "Don't let it send emails anymore"`;

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

function looksLikeAgentBuildIntent(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  return (
    /\b(add|create|build|make|set\s*up|configure|update|change|edit|remove|delete|whenever|when|if|then|wait|email|gmail|slack|hubspot|trigger|action|workflow|agent)\b/i.test(
      t,
    )
  );
}

function looksLikeEmptyPromise(text: string): boolean {
  return /\b(i('?ll| will)|let me|going to|i can)\b[\s\S]{0,80}\b(set\s*up|add|create|build|configure)\b/i.test(
    text || "",
  );
}

export async function runAgentBuilderTurn(
  request: AiGenerateRequest,
  opts?: AgentTurnOptions,
): Promise<AgentTurnResult> {
  const report = opts?.onProgress ?? (() => {});
  const allowedTools = agentToolNames();
  const toolResults: AiToolCallResult[] = [];
  let forcedToolRetry = false;

  report({
    phase: "thinking",
    label: "Thinking",
    detail: "Inspecting agent…",
  });

  // Seed with live agent state so the model mutates the open builder agent.
  report({
    phase: "tool",
    label: "Thinking",
    detail: labelForAgentTool("agent.get"),
    toolName: "agent.get",
    contentStreaming: true,
  });
  const inspect = await executeAuthorizedTool({
    name: "agent.get",
    arguments: {
      ...(request.agentId ? { agentId: request.agentId } : {}),
    },
  });
  toolResults.push(inspect);
  report({
    phase: "follow_up",
    label: "Thinking",
    detail: labelForAgentTool("agent.get"),
    toolName: "agent.get",
    toolOk: inspect.ok,
    contentStreaming: true,
  });

  if (!inspect.ok) {
    return {
      content:
        inspect.output ||
        "I couldn’t load this agent. Open the Agent Builder on the right and try again.",
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
      toolResults,
    };
  }

  let working: AiGenerateRequest = {
    ...request,
    allowTools: true,
    allowedToolNames: allowedTools,
    toolContext: [
      formatToolsForPrompt(allowedTools),
      AGENT_BUILDER_INSTRUCTIONS,
      request.agentId
        ? `Active agentId for this project (MUST use this agent): ${request.agentId}`
        : "Use the project's primary agent (omit agentId).",
      formatToolResultsNote(toolResults),
      "Current agent state is above. Apply the user's request with mutation tools now.",
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
      suppressContentDelta: true,
    });
    const { text, call } = parseToolCallFromContent(generated.content);

    let toolCall = call;
    if (toolCall && !allowedTools.includes(toolCall.name)) {
      toolCall = null;
    }
    if (toolCall && !toolCall.name.startsWith("agent.")) {
      toolCall = null;
    }
    // Ignore re-get unless we need it — prefer mutations after seed.
    if (
      toolCall?.name === "agent.get" &&
      toolResults.some((r) => r.name === "agent.get" && r.ok)
    ) {
      // Allow get if model needs fresh IDs after mutations — keep it.
    }

    if (!toolCall) {
      const visible =
        sanitizeAssistantVisibleText(text || generated.content).trim() || "";
      const mutationCount = toolResults.filter(
        (r) => r.name !== "agent.get",
      ).length;
      const needsForce =
        !forcedToolRetry &&
        mutationCount === 0 &&
        looksLikeAgentBuildIntent(request.content) &&
        (looksLikeEmptyPromise(visible) || !visible);

      if (needsForce) {
        forcedToolRetry = true;
        working = {
          ...working,
          toolContext: [
            formatToolsForPrompt(allowedTools),
            AGENT_BUILDER_INSTRUCTIONS,
            formatToolResultsNote(toolResults),
            "CRITICAL: You did not call a mutation tool. Do not apologize. End with exactly one JSON tool call now, e.g.",
            '{"tool":"agent.step.add","arguments":{"kind":"trigger","label":"Email received","type":"gmail.message_received"}}',
          ].join("\n\n"),
          content: [
            request.content,
            "",
            "Call agent.step.add (or another agent.* mutation) now. No prose-only replies.",
          ].join("\n"),
        };
        continue;
      }

      const content =
        visible ||
        (mutationCount
          ? "Done — check the Agent Builder on the right for the latest workflow."
          : generated.content);

      if (round === 0 || mutationCount > 0) {
        report({
          phase: "generating",
          label: "Thinking",
          detail: "Building agent…",
          contentDelta: content,
          contentStreaming: true,
        });
      }

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
        ...(generated.content
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

  const finalContent =
    sanitizeAssistantVisibleText(summary.content).trim() ||
    "Updated the agent — see the builder on the right.";

  report({
    phase: "generating",
    label: "Thinking",
    detail: "Building agent…",
    contentDelta: finalContent,
    contentStreaming: true,
  });

  return {
    ...summary,
    content: finalContent,
    toolResults: toolResults.length ? toolResults : undefined,
  };
}
