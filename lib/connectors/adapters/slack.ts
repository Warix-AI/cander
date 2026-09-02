/**
 * Slack connector adapter — Composio mapping behind shared interface.
 * Lifecycle enablement is separate; this adapter is ready for Phase 4.
 */

import { redactComposioPayload } from "../composio-tools.ts";
import type { ToolReference } from "../../ai/tools/types.ts";
import {
  buildSuccessResult,
  pickString,
  unwrapProviderData,
  type ConnectorAdapter,
} from "./types.ts";

const SLACK_SLUGS: Record<string, string> = {
  "slack.search": "SLACK_SEARCH_MESSAGES",
  "slack.read": "SLACK_FETCH_MESSAGE",
  "slack.send": "SLACK_SEND_MESSAGE",
};

export const slackAdapter: ConnectorAdapter = {
  connectorId: "slack",

  mapArguments(toolId, args) {
    if (toolId === "slack.search") {
      const query = String(args.query ?? "").trim();
      if (!query) throw new Error("Missing required argument: query");
      const maxResults = Math.min(25, Math.max(1, Number(args.maxResults) || 10));
      return { query, max_results: maxResults };
    }
    if (toolId === "slack.read") {
      const channel = String(args.channel ?? "").trim();
      const ts = String(args.ts ?? "").trim();
      if (!channel || !ts) throw new Error("Missing required arguments: channel, ts");
      return { channel, ts };
    }
    if (toolId === "slack.send") {
      const channel = String(args.channel ?? "").trim();
      const text = String(args.text ?? "").trim();
      if (!channel || !text) throw new Error("Missing required arguments: channel, text");
      return { channel, text };
    }
    throw new Error(`Unsupported Slack tool: ${toolId}`);
  },

  providerSlug(toolId) {
    const slug = SLACK_SLUGS[toolId];
    if (!slug) throw new Error(`Unsupported Slack tool: ${toolId}`);
    return slug;
  },

  normalizeResult(input) {
    const data = redactComposioPayload(unwrapProviderData(input.raw));
    const refs: ToolReference[] = [];
    if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      if (Array.isArray(obj.messages)) {
        for (const msg of obj.messages) {
          if (!msg || typeof msg !== "object") continue;
          const row = msg as Record<string, unknown>;
          const id = pickString(row.ts, row.id);
          if (!id) continue;
          refs.push({
            type: "slack_message",
            id,
            label: pickString(row.text)?.slice(0, 80) ?? id,
            metadata: {
              channel: pickString(row.channel, row.channel_id),
            },
          });
        }
      }
      const channel = pickString(obj.channel, obj.channel_id);
      if (channel) {
        refs.push({ type: "slack_channel", id: channel });
      }
      const ts = pickString(obj.ts);
      if (ts) {
        refs.push({
          type: "slack_message",
          id: ts,
          metadata: { channel },
        });
      }
    }
    return buildSuccessResult({
      toolId: input.toolId,
      toolCallId: input.toolCallId,
      idempotencyKey: input.idempotencyKey,
      connectionId: input.connectionId,
      data:
        typeof data === "object" && data
          ? data
          : { outcome: "ok", result: data },
      references: refs,
    });
  },
};
