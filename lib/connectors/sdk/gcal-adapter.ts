/**
 * Google Calendar ConnectorViewAdapter — list / create via Composio.
 * No mail sync table; the panel loads events on demand.
 */

import { executeConnectorTool } from "../tool-execute.ts";
import { createSupabaseAdminClient } from "../../supabase/admin.ts";
import type {
  ActionContext,
  ActionResult,
  ConnectorViewAdapter,
  SyncContext,
  SyncResult,
} from "./types.ts";

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
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

function extractEvents(payload: Record<string, unknown>): unknown[] {
  if (Array.isArray(payload.events)) return payload.events;
  if (Array.isArray(payload.items)) return payload.items;
  const data = payload.data;
  if (data && typeof data === "object") {
    const inner = data as Record<string, unknown>;
    if (Array.isArray(inner.events)) return inner.events;
    if (Array.isArray(inner.items)) return inner.items;
  }
  return [];
}

export const gcalViewAdapter: ConnectorViewAdapter = {
  connectorId: "gcal",
  capabilities: {
    sync: false,
    list: true,
  },

  async sync(_ctx: SyncContext): Promise<SyncResult> {
    return { upserted: [], cursor: null, providerState: {} };
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
        case "listEvents": {
          const result = await runTool(ctx, "gcal.listEvents", args);
          if (!result.ok) return { ok: false, error: result.error };
          const payload = parseToolJson(result.output);
          return {
            ok: true,
            data: {
              events: extractEvents(payload),
              raw: payload,
            },
          };
        }
        case "listCalendars": {
          const result = await runTool(ctx, "gcal.listCalendars", args);
          if (!result.ok) return { ok: false, error: result.error };
          return { ok: true, data: parseToolJson(result.output) };
        }
        case "createEvent": {
          const result = await runTool(ctx, "gcal.createEvent", args, true);
          if (!result.ok) return { ok: false, error: result.error };
          return { ok: true, data: parseToolJson(result.output) };
        }
        case "quickAdd": {
          const text = pickString(args.text, args.query);
          if (!text) return { ok: false, error: "Missing event text." };
          const result = await runTool(
            ctx,
            "gcal.quickAdd",
            { text, calendarId: args.calendarId },
            true,
          );
          if (!result.ok) return { ok: false, error: result.error };
          return { ok: true, data: parseToolJson(result.output) };
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
