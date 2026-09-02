/**
 * Gmail connector turns — OpenAI decides tools; client executes gmail.search/read/send.
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
import { enabledToolIds } from "@/lib/connectors/tool-catalog";
import {
  CONNECTOR_USER_VOICE_RULES,
  finalizeConnectorReply,
  gmailEmptyResultMessage,
  isEmptyGmailSearchResult,
} from "@/lib/ai/connectors/connector-response";
import {
  inferSendMailFromThread,
  looksLikeFalseSendClaim,
  looksLikeReadSearchIntent,
  looksLikeSendIntent,
} from "@/lib/ai/connectors/comms-intent";
import {
  hasSuccessfulGmailSend,
} from "@/lib/ai/connectors/connector-response";

const GMAIL_READ_TOOLS = ["gmail.search", "gmail.read"] as const;
const GMAIL_WRITE_TOOLS = ["gmail.send", "gmail.draft", "gmail.reply"] as const;
const MAX_ROUNDS = 4;

function buildGmailTurnInstructions(enabledTools: string[]): string {
  const readEnabled = GMAIL_READ_TOOLS.some((tool) => enabledTools.includes(tool));
  const writeEnabled = GMAIL_WRITE_TOOLS.some((tool) => enabledTools.includes(tool));

  const capabilityLines: string[] = [];
  if (readEnabled) {
    capabilityLines.push(
      "- Search and read mail with gmail.search and gmail.read.",
      '- Example: {"tool":"gmail.search","arguments":{"query":"is:unread newer_than:7d"}}',
      '- Example: {"tool":"gmail.read","arguments":{"messageId":"<id from search>"}}',
    );
  }
  if (writeEnabled) {
    capabilityLines.push(
      "- You CAN send email with gmail.send — never say you cannot send from here.",
      "- Send email with gmail.send when the user asks to send or confirms a draft (e.g. \"send it\").",
      "- NEVER claim an email was sent unless gmail.send succeeded in tool results below.",
      "- If the user asks whether you can send/read Gmail, answer from the tools listed above — do not deny access you have this turn.",
      '- Example: {"tool":"gmail.send","arguments":{"to":"alice@example.com","subject":"Hello","body":"..."}}',
      "- Create drafts with gmail.draft when the user wants a draft to review before sending.",
      '- Example: {"tool":"gmail.draft","arguments":{"to":"alice@example.com","subject":"Hello","body":"..."}}',
      "- Reply in an existing thread with gmail.reply when the user asks you to reply.",
      '- Example: {"tool":"gmail.reply","arguments":{"threadId":"<thread id>","body":"Thanks for the update."}}',
      "- Confirm recipient, subject, and body before sending. Never send without a clear user request.",
    );
  }

  return `You have access to the user's connected Gmail for this turn.

${capabilityLines.join("\n")}

When you need mail data or to send mail, end your reply with exactly one JSON object on its own line.

Rules:
- Do NOT stop at "I will search" or "Let me check" — either emit the tool JSON or wait for results and summarize.
- After tool results appear below, answer in plain language with what you found (or that nothing matched).
- Stay in the email task when the conversation is about drafting or sending — do not run gmail.search unless the user asked to read or search mail.
- ${CONNECTOR_USER_VOICE_RULES}
${readEnabled ? "- Use Gmail query syntax in gmail.search (e.g. is:unread, from:alice, subject:BYU, newer_than:30d)." : ""}
${readEnabled ? "- Never invent message IDs — use gmail.read only with IDs from gmail.search results." : ""}`;
}

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
  if (/write access|sending email is disabled/i.test(text)) {
    return "Sending email is turned off. Open **Connectors**, enable **Write access** for Gmail, then ask again.";
  }
  return null;
}

async function ensureGmailConnected(
  workspaceId: string,
): Promise<
  | { ok: false; message: string }
  | { ok: true; enabledTools: string[] }
> {
  try {
    const connections = await fetchConnectorConnections(workspaceId);
    const gmail = connections.find(
      (c) => c.connectorId === "gmail" && c.status === "active",
    );
    if (!gmail) {
      return {
        ok: false,
        message:
          "Gmail isn’t connected yet. Open **Connectors**, connect Gmail, then ask again.",
      };
    }
    const enabledTools = enabledToolIds("gmail", gmail.toolPermissions);
    if (!enabledTools.length) {
      return {
        ok: false,
        message:
          "Gmail is connected but AI access is turned off. Open **Connectors** and enable read or write access.",
      };
    }
    return { ok: true, enabledTools };
  } catch (err) {
    const message =
      err instanceof Error ? err.message.trim() : "Could not verify Gmail connection.";
    if (/not configured|403|401|unauthorized|denied/i.test(message)) {
      return { ok: false, message };
    }
    return {
      ok: false,
      message: "Could not verify Gmail connection. Try again in a moment.",
    };
  }
}

function trySendFallback(input: {
  request: AiGenerateRequest;
  assistantText?: string;
  allowedTools: string[];
}): { name: string; arguments: Record<string, unknown> } | null {
  if (!input.allowedTools.includes("gmail.send")) return null;
  if (!looksLikeSendIntent(input.request.content)) return null;
  const draft = inferSendMailFromThread([
    ...(input.request.messages ?? []),
    ...(input.assistantText
      ? [{ role: "assistant" as const, content: input.assistantText }]
      : []),
  ]);
  if (!draft) return null;
  return {
    name: "gmail.send",
    arguments: {
      to: draft.to,
      subject: draft.subject,
      body: draft.body,
    },
  };
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

  const gmailState = await ensureGmailConnected(request.workspaceId);
  if (!gmailState.ok) {
    return {
      content: gmailState.message,
      runtime: "cloud",
      offline: false,
      condensationOccurred: false,
      aiChatId: request.aiChatId ?? null,
    };
  }

  const allowedTools = gmailState.enabledTools;
  const toolResults: AiToolCallResult[] = [];
  let working: AiGenerateRequest = {
    ...request,
    allowTools: true,
    allowedToolNames: allowedTools,
    toolContext: [
      formatToolsForPrompt(allowedTools),
      buildGmailTurnInstructions(allowedTools),
    ].join("\n\n"),
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (round > 0) {
      report({
        phase: "follow_up",
        label: "Thinking",
        detail: "Using Gmail…",
        contentStreaming: true,
      });
    }

    const generated = await runRawOpenAITurn(working, {
      ...opts,
      suppressContentDelta: true,
    });
    const { text, call } = parseToolCallFromContent(generated.content);

    if (round === 0) {
      const ack =
        sanitizeAssistantVisibleText(text || generated.content).trim() ||
        "Checking your Gmail — one moment.";
      report({
        phase: "generating",
        label: "Thinking",
        detail: "Checking Gmail…",
        contentDelta: ack,
        contentStreaming: true,
      });
    }

    let toolCall = call;
    if (toolCall && !allowedTools.includes(toolCall.name)) {
      toolCall = null;
    }

    // Model promised to search but didn't emit JSON — run search only for read/search asks.
    if (
      !toolCall &&
      !toolResults.length &&
      allowedTools.includes("gmail.search") &&
      looksLikeReadSearchIntent(request.content) &&
      (looksLikeSearchPromise(text || generated.content) ||
        looksLikeReadSearchIntent(request.content))
    ) {
      toolCall = {
        name: "gmail.search",
        arguments: {
          query: inferGmailSearchQuery(request.content),
          maxResults: 10,
        },
      };
    }

    // User wants to send — execute gmail.send from thread draft when model skips the tool.
    if (!toolCall && !toolResults.length) {
      const sendFallback = trySendFallback({
        request,
        assistantText: text || generated.content,
        allowedTools,
      });
      if (sendFallback) toolCall = sendFallback;
    }

    if (!toolCall) {
      const pendingDraft = inferSendMailFromThread([
        ...(request.messages ?? []),
        ...(text || generated.content
          ? [{ role: "assistant" as const, content: text || generated.content }]
          : []),
      ]);
      let content = finalizeConnectorReply({
        text: text || generated.content,
        connectorId: "gmail",
        userMessage: request.content,
        toolResults,
        draft: pendingDraft,
      });

      if (
        looksLikeFalseSendClaim(content) &&
        !hasSuccessfulGmailSend(toolResults)
      ) {
        content =
          pendingDraft && allowedTools.includes("gmail.send")
            ? "I haven't sent that yet — say **send it** and I'll send it through your connected Gmail."
            : "I haven't sent that email yet.";
      }

      return {
        ...generated,
        content:
          content ||
          (toolResults.length
            ? toolResults.map((t) => t.output).join("\n\n")
            : gmailEmptyResultMessage(request.content)),
        toolResults: toolResults.length ? toolResults : undefined,
      };
    }

    report({
      phase: "tool",
      label: "Thinking",
      detail:
        toolCall.name === "gmail.read"
          ? "Reading email…"
          : toolCall.name === "gmail.send"
            ? "Sending email…"
            : toolCall.name === "gmail.draft"
              ? "Creating draft…"
              : toolCall.name === "gmail.reply"
                ? "Replying in thread…"
                : "Searching Gmail…",
      toolName: toolCall.name,
      contentStreaming: true,
    });
    const result = await executeConnectorGmailTool(
      { name: toolCall.name, args: toolCall.arguments ?? {} },
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

    if (isEmptyGmailSearchResult(result)) {
      return {
        content: gmailEmptyResultMessage(request.content),
        runtime: "cloud",
        offline: false,
        condensationOccurred: false,
        aiChatId: request.aiChatId ?? null,
        toolResults,
      };
    }

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
    if (
      toolCall.name === "gmail.search" ||
      toolCall.name === "gmail.read" ||
      toolCall.name === "gmail.send" ||
      toolCall.name === "gmail.draft" ||
      toolCall.name === "gmail.reply"
    ) {
      working = {
        ...working,
        content: [
          request.content,
          "",
          toolCall.name === "gmail.send" ||
          toolCall.name === "gmail.draft" ||
          toolCall.name === "gmail.reply"
            ? `Confirm what was sent or drafted for the user. ${CONNECTOR_USER_VOICE_RULES}`
            : `Summarize the Gmail data above for the user. ${CONNECTOR_USER_VOICE_RULES}`,
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
        `Summarize the Gmail data above for the user in plain language. ${CONNECTOR_USER_VOICE_RULES}`,
      ].join("\n"),
    },
    { ...opts, suppressContentDelta: true },
  );

  return {
    ...summary,
    content: finalizeConnectorReply({
      text: summary.content,
      connectorId: "gmail",
      userMessage: request.content,
      toolResults,
      draft: inferSendMailFromThread(request.messages),
    }),
    toolResults,
  };
}
