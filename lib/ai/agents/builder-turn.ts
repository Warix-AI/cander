/**
 * Agent Builder chat turns — configure Skills + Access + Trigger (not Zapier steps).
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

const AGENT_BUILDER_INSTRUCTIONS = `You are helping the user configure a Cander Agent.

An Agent is simply: Instructions (Markdown) + Schedule + a runtime conversation with Cander.
There are NO agent-specific connections or tool grants. Cander already has the user's connectors.

The right panel shows Instructions and Schedule. Mutate them ONLY through agent.* tools.
Never claim you changed the agent unless a tool succeeded.

How to work:
1. agent.get when you need current name/instructions/schedule/status.
2. Update the job via agent.skill.create or agent.skill.update (these write Instructions markdown).
3. Set schedule with agent.trigger.set — presets:
   every_1_minute | every_5_minutes | every_15_minutes | every_30_minutes | hourly | daily | custom
   or type=manual.
4. agent.update_metadata for name/description/status (draft|active|paused).
5. agent.run only when the user asks to run now.

Examples:
- "Only respond to Matt" → rewrite instructions to include that filter.
- "Change this to run every hour" → agent.trigger.set schedule hourly.
- "Rewrite the instructions to be more professional" → agent.skill.update with polished markdown.

Never grant Gmail/tools on the agent itself. Never invent connector permission UIs.`;

function agentToolNames(): string[] {
  return [...TOOL_DOMAINS.agent];
}

function formatToolResultsNote(results: AiToolCallResult[]): string {
  return results
    .map((r) => `Tool ${r.name} (${r.ok ? "ok" : "failed"}):\n${r.output}`)
    .join("\n\n");
}

function looksLikeAgentBuildIntent(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  return /\b(add|create|build|make|set\s*up|configure|update|change|edit|remove|delete|whenever|when|every|schedule|skill|gmail|slack|hubspot|crm|email|agent|follow.?up)\b/i.test(
    t,
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
        ? `Active agentId: ${request.agentId}`
        : "Use the project's primary agent.",
      formatToolResultsNote(toolResults),
      "Apply the user's request with skill / access / trigger tools now.",
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
    if (toolCall && !allowedTools.includes(toolCall.name)) toolCall = null;
    if (toolCall && !toolCall.name.startsWith("agent.")) toolCall = null;

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
            "CRITICAL: Call a mutation tool now. Example:",
            '{"tool":"agent.skill.create","arguments":{"name":"Buddy","markdown":"# Buddy\\n\\nWhen you wake, ask Cander to…"}}',
          ].join("\n\n"),
          content: [
            request.content,
            "",
            "Call agent.skill.create or agent.trigger.set now. No prose-only replies.",
          ].join("\n"),
        };
        continue;
      }

      const content =
        visible ||
        (mutationCount
          ? "Done — check the Agent panel on the right."
          : generated.content);

      report({
        phase: "generating",
        label: "Thinking",
        detail: "Updating agent…",
        contentDelta: content,
        contentStreaming: true,
      });

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
          ? "Continue with the next config change if needed, or summarize."
          : "The last tool failed — fix it or explain.",
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
        "Continue configuring the agent with tools if needed; otherwise summarize.",
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
        "Summarize the agent configuration changes in plain language. No tool JSON.",
      ].join("\n"),
    },
    { ...opts, suppressContentDelta: true },
  );

  const finalContent =
    sanitizeAssistantVisibleText(summary.content).trim() ||
    "Updated the agent — see the panel on the right.";

  report({
    phase: "generating",
    label: "Thinking",
    detail: "Updating agent…",
    contentDelta: finalContent,
    contentStreaming: true,
  });

  return {
    ...summary,
    content: finalContent,
    toolResults: toolResults.length ? toolResults : undefined,
  };
}
