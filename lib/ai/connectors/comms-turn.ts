/**
 * Gmail connector turns — OpenAI decides tools; client executes gmail.search/read.
 */

import type {
  AgentTurnOptions,
  AgentTurnResult,
} from "@/lib/ai/runtime/agent-turn";
import { runRawOpenAITurn } from "@/lib/ai/raw-openai/run-turn";
import {
  formatToolsForPrompt,
  type AiToolCallResult,
} from "@/lib/ai/runtime/tools";
import { executeConnectorGmailTool } from "@/lib/ai/connectors/tool-executors";
import type { AiGenerateRequest } from "@/lib/ai/runtime/types";
import {
  parseToolCallFromContent,
  sanitizeAssistantVisibleText,
} from "@/lib/ai/tool-protocol";
import { fetchConnectorConnections } from "@/lib/api/connector-client";

const COMMS_TOOLS = ["gmail.search", "gmail.read"] as const;
const MAX_ROUNDS = 4;

const GMAIL_TURN_INSTRUCTIONS = `You have read-only access to the user's connected Gmail for this turn.

When you need mail data, end your reply with exactly one JSON object on its own line:
{"tool":"gmail.search","arguments":{"query":"is:unread newer_than:7d"}}
or {"tool":"gmail.read","arguments":{"messageId":"<id from search>"}}

Rules:
- Do NOT stop at "I will search" or "Let me check" — either emit the tool JSON or wait for results and summarize.
- After tool results appear below, answer in plain language with what you found (or that nothing matched).
- Use Gmail query syntax in gmail.search (e.g. is:unread, from:alice, subject:BYU, newer_than:30d).
- Never invent message IDs — use gmail.read only with IDs from gmail.search results.`;

function inferGmailSearchQuery(content: string): string {
  const text = (content || "").trim();
  const lower = text.toLowerCase();
  if (/\bunread\b/.test(lower)) return "is:unread newer_than:30d";
  if (/\b(sent|outbox)\b/.test(lower)) return "in:sent newer_than:30d";
  if (/\b(draft)\b/.test(lower)) return "in:drafts newer_than:90d";
  if (/\bbyu\b/.test(lower) && /\bfootball\b/.test(lower)) {
    return "newer_than:90d (BYU OR cougars OR football)";
  }
  if (/\b(latest|recent|new)\b/.test(lower)) return "in:inbox newer_than:7d";
  return "in:inbox newer_than:14d";
}

function looksLikeSearchPromise(text: string): boolean {
  return /\b(i'll|i will|let me|going to)\b[\s\S]{0,40}\b(search|check|look|read)\b/i.test(
    text,
  );
}

function connectorToolFailureMessage(output: string): string | null {
  const text = (output || "").trim();
  if (!text) return null;
  if (/not configured on this server/i.test(text)) {
    return "Gmail is connected in your workspace, but this server can’t call Composio yet. Add `COMPOSIO_API_KEY` and `COMPOSIO_GMAIL_AUTH_CONFIG_ID` to `.env.local` (see `.env.example`), restart the dev server, then ask again.";
  }
  if (/not enabled for this workspace/i.test(text)) {
    return "Gmail isn’t enabled for this workspace. Open **Connectors** and enable Gmail.";
  }
  if (/connect gmail in connectors/i.test(text)) {
    return "Gmail isn’t connected yet. Open **Connectors**, connect Gmail, then ask again.";
  }
  return null;
}

async function ensureGmailConnected(
  workspaceId: string,
): Promise<string | null> {
  try {
    const connections = await fetchConnectorConnections(workspaceId);
    const gmail = connections.find(
      (c) => c.connectorId === "gmail" && c.status === "active",
    );
    if (!gmail) {
      return "Gmail isn’t connected yet. Open **Connectors**, connect Gmail, then ask again.";
    }
    return null;
  } catch {
    return null;
  }
}

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

  const notConnected = await ensureGmailConnected(request.workspaceId);
  if (notConnected) {
    return {
      content: notConnected,
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
    };
  }

  const toolResults: AiToolCallResult[] = [];
  let working: AiGenerateRequest = {
    ...request,
    allowTools: true,
    allowedToolNames: [...COMMS_TOOLS],
    toolContext: [
      formatToolsForPrompt([...COMMS_TOOLS]),
      GMAIL_TURN_INSTRUCTIONS,
    ].join("\n\n"),
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (round > 0) {
      report({ phase: "follow_up", label: "Thinking", detail: "Using Gmail…" });
    }

    const generated = await runRawOpenAITurn(working, {
      ...opts,
      suppressContentDelta: true,
    });
    const { text, call } = parseToolCallFromContent(generated.content);

    let toolCall = call;
    if (
      toolCall &&
      !COMMS_TOOLS.includes(toolCall.name as (typeof COMMS_TOOLS)[number])
    ) {
      toolCall = null;
    }

    // Model promised to search but didn't emit JSON — run search ourselves.
    if (
      !toolCall &&
      !toolResults.length &&
      (looksLikeSearchPromise(text || generated.content) || round === 0)
    ) {
      toolCall = {
        name: "gmail.search",
        arguments: {
          query: inferGmailSearchQuery(request.content),
          maxResults: 10,
        },
      };
    }

    if (!toolCall) {
      const content =
        sanitizeAssistantVisibleText(text || generated.content).trim() ||
        (toolResults.length
          ? toolResults.map((t) => t.output).join("\n\n")
          : "I couldn't find anything in Gmail for that request.");
      return {
        ...generated,
        content,
        toolResults: toolResults.length ? toolResults : undefined,
      };
    }

    report({
      phase: "tool",
      label: "Thinking",
      detail:
        toolCall.name === "gmail.read" ? "Reading email…" : "Searching Gmail…",
      toolName: toolCall.name,
    });
    const result = await executeConnectorGmailTool(
      { name: toolCall.name, args: toolCall.arguments },
      request.workspaceId,
    );
    if (!result) {
      return {
        content: "Gmail tool isn’t available right now.",
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
      };
    }
    toolResults.push(result);

    const toolFailure = !result.ok
      ? connectorToolFailureMessage(result.output)
      : null;
    if (toolFailure) {
      return {
        content: toolFailure,
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
        toolResults,
      };
    }

    const toolNote = `Tool ${toolCall.name} (${result.ok ? "ok" : "failed"}):\n${result.output}`;
    working = {
      ...working,
      toolContext: [working.toolContext, toolNote].filter(Boolean).join("\n\n"),
      messages: [
        ...(request.messages ?? []),
        { role: "user", content: request.content },
        ...(round === 0 && generated.content
          ? [{ role: "assistant" as const, content: generated.content }]
          : []),
      ],
    };

    // After search/read, next round synthesizes a user-facing answer.
    if (toolCall.name === "gmail.search" || toolCall.name === "gmail.read") {
      working = {
        ...working,
        content: [
          request.content,
          "",
          "Summarize the Gmail tool results above for the user. If nothing matched, say clearly that no matching emails were found.",
        ].join("\n"),
      };
    }
  }

  const summary = await runRawOpenAITurn(
    {
      ...working,
      allowTools: false,
      allowedToolNames: [],
      content: [
        request.content,
        "",
        "Summarize the Gmail tool results above for the user in plain language.",
      ].join("\n"),
    },
    opts,
  );

  return {
    ...summary,
    content:
      sanitizeAssistantVisibleText(summary.content).trim() ||
      toolResults.map((t) => t.output).join("\n\n") ||
      "No matching emails were found in Gmail.",
    toolResults,
  };
}
