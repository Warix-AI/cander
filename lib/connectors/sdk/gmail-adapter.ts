/**
 * Gmail ConnectorViewAdapter — sync headers + operations via Composio.
 * Never calls an LLM or the agent runtime.
 */

import { executeConnectorTool } from "../tool-execute.ts";
import { createSupabaseAdminClient } from "../../supabase/admin.ts";
import type {
  ActionContext,
  ActionResult,
  ConnectorViewAdapter,
  SyncContext,
  SyncMessageHeader,
  SyncResult,
} from "./types.ts";

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function parseDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Gmail internalDate is often ms epoch as number/string
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    if (/^\d+$/.test(value.trim())) {
      const n = Number(value.trim());
      const ms = n < 1e12 ? n * 1000 : n;
      return new Date(ms).toISOString();
    }
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function splitAddrs(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function labelIdsOf(row: Record<string, unknown>): string[] {
  const raw = row.labelIds ?? row.label_ids;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item));
}

function headerFromSearchRow(row: Record<string, unknown>): SyncMessageHeader | null {
  const id = pickString(row.id, row.messageId, row.message_id);
  if (!id) return null;
  const labels = labelIdsOf(row);
  return {
    providerMessageId: id,
    threadId: pickString(row.threadId, row.thread_id) ?? null,
    fromAddr: pickString(row.from) ?? null,
    toAddrs: splitAddrs(row.to),
    ccAddrs: splitAddrs(row.cc),
    subject: pickString(row.subject) ?? null,
    snippet: pickString(row.snippet) ?? null,
    receivedAt: parseDate(row.date ?? row.internalDate ?? row.internal_date),
    isUnread: labels.includes("UNREAD") || row.isUnread === true,
    isArchived: labels.length > 0 ? !labels.includes("INBOX") : false,
    hasAttachments: Boolean(
      row.hasAttachments ?? row.has_attachments ?? false,
    ),
    rawMeta: {
      labelIds: labels,
    },
  };
}

async function runTool(
  ctx: ActionContext | SyncContext,
  tool: string,
  args: Record<string, unknown>,
  confirmed = false,
) {
  const admin = createSupabaseAdminClient();
  return executeConnectorTool({
    client: admin,
    workspaceId: ctx.workspaceId,
    profileId: ctx.profileId,
    tool,
    arguments: args,
    connectionId: ctx.connectionId,
    confirmed,
  });
}

function parseToolJson(output: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(output) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

export const gmailViewAdapter: ConnectorViewAdapter = {
  connectorId: "gmail",
  capabilities: {
    sync: true,
    list: true,
    readBody: true,
    compose: true,
    reply: true,
    archive: true,
    markRead: true,
    markUnread: true,
  },

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const limit = Math.min(50, Math.max(1, ctx.limit ?? 40));
    const result = await runTool(ctx, "gmail.search", {
      query: "in:inbox",
      maxResults: Math.min(25, limit),
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    const payload = parseToolJson(result.output);
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const upserted: SyncMessageHeader[] = [];
    for (const item of messages) {
      if (!item || typeof item !== "object") continue;
      const header = headerFromSearchRow(item as Record<string, unknown>);
      if (header) upserted.push(header);
    }

    // Second page-ish: also pull recent mail outside inbox if under limit.
    if (upserted.length < limit) {
      const recent = await runTool(ctx, "gmail.search", {
        query: "newer_than:14d",
        maxResults: Math.min(25, limit - upserted.length),
      });
      if (recent.ok) {
        const recentPayload = parseToolJson(recent.output);
        const recentMessages = Array.isArray(recentPayload.messages)
          ? recentPayload.messages
          : [];
        const seen = new Set(upserted.map((m) => m.providerMessageId));
        for (const item of recentMessages) {
          if (!item || typeof item !== "object") continue;
          const header = headerFromSearchRow(item as Record<string, unknown>);
          if (!header || seen.has(header.providerMessageId)) continue;
          upserted.push(header);
          seen.add(header.providerMessageId);
          if (upserted.length >= limit) break;
        }
      }
    }

    return {
      upserted: upserted.slice(0, limit),
      cursor: new Date().toISOString(),
      providerState: {
        lastQuery: "in:inbox",
        count: upserted.length,
      },
    };
  },

  async executeAction(
    action: string,
    input: unknown,
    ctx: ActionContext,
  ): Promise<ActionResult> {
    const args =
      input && typeof input === "object"
        ? (input as Record<string, unknown>)
        : {};

    try {
      switch (action) {
        case "compose":
        case "send": {
          const result = await runTool(ctx, "gmail.send", args, true);
          if (!result.ok) return { ok: false, error: result.error };
          return { ok: true, data: parseToolJson(result.output) };
        }
        case "reply": {
          const result = await runTool(ctx, "gmail.reply", args, true);
          if (!result.ok) return { ok: false, error: result.error };
          return { ok: true, data: parseToolJson(result.output) };
        }
        case "archive": {
          const result = await runTool(ctx, "gmail.archive", args, true);
          if (!result.ok) return { ok: false, error: result.error };
          return { ok: true, data: { archived: true } };
        }
        case "markRead": {
          const result = await runTool(ctx, "gmail.markRead", args, true);
          if (!result.ok) return { ok: false, error: result.error };
          return { ok: true, data: { isUnread: false } };
        }
        case "markUnread": {
          const result = await runTool(ctx, "gmail.markUnread", args, true);
          if (!result.ok) return { ok: false, error: result.error };
          return { ok: true, data: { isUnread: true } };
        }
        case "readBody": {
          const messageId = pickString(args.messageId, args.message_id);
          if (!messageId) return { ok: false, error: "Missing messageId." };
          const result = await runTool(ctx, "gmail.read", {
            messageId,
          });
          if (!result.ok) return { ok: false, error: result.error };
          const payload = parseToolJson(result.output);
          const message =
            payload.message && typeof payload.message === "object"
              ? (payload.message as Record<string, unknown>)
              : payload;
          return {
            ok: true,
            data: {
              bodyText: pickString(message.body, message.text) ?? null,
              bodyHtml: pickString(message.html, message.bodyHtml) ?? null,
              subject: pickString(message.subject) ?? null,
              from: pickString(message.from) ?? null,
              to: pickString(message.to) ?? null,
              snippet: pickString(message.snippet) ?? null,
            },
          };
        }
        default:
          return { ok: false, error: `Unsupported action: ${action}` };
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Operation failed.",
      };
    }
  },
};
