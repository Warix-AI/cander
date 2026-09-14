/**
 * Convert Cander connector tools into OpenAI Realtime session function tools.
 * Same connector/MCP surface the chat agent exposes via Composio.
 */

import { listCanderTools } from "@/lib/ai/tools/cander-registry";
import {
  canderToolToOpenAIFunction,
  fromOpenAIToolName,
  toOpenAIToolName,
} from "@/lib/ai/tools/schemas";

export { fromOpenAIToolName, toOpenAIToolName };

export type RealtimeFunctionTool = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

/**
 * Tools for a Live session. When `connectorIds` is provided, only tools for
 * those connected apps are exposed (matches chat agent exposure).
 */
export function realtimeConversationTools(opts?: {
  connectorIds?: string[];
}): RealtimeFunctionTool[] {
  const allow = opts?.connectorIds?.length
    ? new Set(opts.connectorIds)
    : null;
  return listCanderTools()
    .filter((tool) => {
      if (!tool.defaultEnabled || !tool.connectorId) return false;
      if (allow && !allow.has(tool.connectorId)) return false;
      return true;
    })
    .map((tool) => {
      const fn = canderToolToOpenAIFunction(tool);
      return {
        type: "function" as const,
        name: fn.name,
        description: fn.description,
        parameters: fn.parameters as Record<string, unknown>,
      };
    });
}

export const REALTIME_CONVERSATION_MODEL = "gpt-realtime";

export const REALTIME_CONVERSATION_INSTRUCTIONS = `You are Cander, a helpful voice assistant in a live duplex conversation.
Speak concisely and naturally. Prefer short spoken answers (1–3 sentences) unless the user asks for detail.
You have the same connected-app tools as chat Cander (Gmail, calendar, Slack, files, etc. via MCP/Composio connectors).
Use tools when the user asks about their connected apps or needs you to take an action.
When a tool needs an account and multiple accounts exist, ask which account before calling tools — do not guess connection IDs.
Never invent credentials or connection IDs.
If a tool returns an error or asks to connect an app, tell the user clearly.`;
