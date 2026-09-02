/**
 * Gmail connector adapter — Composio slug/arg/result mapping behind shared interface.
 */

import {
  formatGmailToolOutput,
  GMAIL_COMPOSIO_SLUGS,
  mapGmailToolArguments,
  redactComposioPayload,
  type GmailConnectorToolName,
} from "../composio-tools.ts";
import type { ToolReference } from "../../ai/tools/types.ts";
import {
  buildSuccessResult,
  pickString,
  unwrapProviderData,
  type ConnectorAdapter,
} from "./types.ts";

function isGmailTool(toolId: string): toolId is GmailConnectorToolName {
  return toolId in GMAIL_COMPOSIO_SLUGS;
}

function extractReferences(
  toolId: GmailConnectorToolName,
  data: unknown,
): ToolReference[] {
  const refs: ToolReference[] = [];
  if (!data || typeof data !== "object") return refs;
  const obj = data as Record<string, unknown>;

  if (toolId === "gmail.search" && Array.isArray(obj.messages)) {
    for (const msg of obj.messages) {
      if (!msg || typeof msg !== "object") continue;
      const row = msg as Record<string, unknown>;
      const id = pickString(row.id);
      if (!id) continue;
      refs.push({
        type: "email_message",
        id,
        label: pickString(row.subject) ?? id,
        metadata: {
          threadId: pickString(row.threadId, row.thread_id),
          from: pickString(row.from),
          to: pickString(row.to),
        },
      });
      const threadId = pickString(row.threadId, row.thread_id);
      if (threadId) {
        refs.push({
          type: "email_thread",
          id: threadId,
          label: pickString(row.subject) ?? threadId,
        });
      }
    }
  }

  if (toolId === "gmail.read" && obj.message && typeof obj.message === "object") {
    const msg = obj.message as Record<string, unknown>;
    const id = pickString(msg.id);
    if (id) {
      refs.push({
        type: "email_message",
        id,
        label: pickString(msg.subject) ?? id,
        metadata: {
          threadId: pickString(msg.threadId, msg.thread_id),
        },
      });
    }
  }

  if (toolId === "gmail.send" && obj.sent && typeof obj.sent === "object") {
    const sent = obj.sent as Record<string, unknown>;
    const id = pickString(sent.id);
    if (id) {
      refs.push({ type: "email_message", id, label: "Sent email" });
    }
    const threadId = pickString(sent.threadId, sent.thread_id);
    if (threadId) {
      refs.push({ type: "email_thread", id: threadId });
    }
  }

  if (
    (toolId === "gmail.draft" || toolId === "gmail.reply") &&
    (obj.draft || obj.reply) &&
    typeof (obj.draft ?? obj.reply) === "object"
  ) {
    const payload = (obj.draft ?? obj.reply) as Record<string, unknown>;
    const id = pickString(payload.id);
    if (id) {
      refs.push({
        type: toolId === "gmail.draft" ? "email_message" : "email_message",
        id,
        label: toolId === "gmail.draft" ? "Draft" : "Reply",
      });
    }
    const threadId = pickString(payload.threadId, payload.thread_id);
    if (threadId) {
      refs.push({ type: "email_thread", id: threadId });
    }
  }

  return refs;
}

export const gmailAdapter: ConnectorAdapter = {
  connectorId: "gmail",

  mapArguments(toolId, args) {
    if (!isGmailTool(toolId)) {
      throw new Error(`Unsupported Gmail tool: ${toolId}`);
    }
    return mapGmailToolArguments(toolId, args);
  },

  providerSlug(toolId) {
    if (!isGmailTool(toolId)) {
      throw new Error(`Unsupported Gmail tool: ${toolId}`);
    }
    return GMAIL_COMPOSIO_SLUGS[toolId];
  },

  normalizeResult(input) {
    if (!isGmailTool(input.toolId)) {
      throw new Error(`Unsupported Gmail tool: ${input.toolId}`);
    }
    const outputJson = formatGmailToolOutput(input.toolId, input.raw);
    let data: unknown = { raw: redactComposioPayload(unwrapProviderData(input.raw)) };
    try {
      data = JSON.parse(outputJson);
    } catch {
      /* keep raw */
    }
    return buildSuccessResult({
      toolId: input.toolId,
      toolCallId: input.toolCallId,
      idempotencyKey: input.idempotencyKey,
      connectionId: input.connectionId,
      data,
      references: extractReferences(input.toolId, data),
    });
  },
};
