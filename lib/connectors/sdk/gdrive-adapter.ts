/**
 * Google Drive ConnectorViewAdapter — list / create via Composio.
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

function extractFiles(payload: Record<string, unknown>): unknown[] {
  if (Array.isArray(payload.files)) return payload.files;
  if (Array.isArray(payload.items)) return payload.items;
  const data = payload.data;
  if (data && typeof data === "object") {
    const inner = data as Record<string, unknown>;
    if (Array.isArray(inner.files)) return inner.files;
    if (Array.isArray(inner.items)) return inner.items;
  }
  return [];
}

export const gdriveViewAdapter: ConnectorViewAdapter = {
  connectorId: "gdrive",
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
        case "findFiles": {
          const result = await runTool(ctx, "gdrive.find", args);
          if (!result.ok) return { ok: false, error: result.error };
          const payload = parseToolJson(result.output);
          return {
            ok: true,
            data: {
              files: extractFiles(payload),
              raw: payload,
            },
          };
        }
        case "createFromText": {
          const result = await runTool(ctx, "gdrive.createFromText", args, true);
          if (!result.ok) return { ok: false, error: result.error };
          return { ok: true, data: parseToolJson(result.output) };
        }
        case "createFolder": {
          const result = await runTool(ctx, "gdrive.createFolder", args, true);
          if (!result.ok) return { ok: false, error: result.error };
          return { ok: true, data: parseToolJson(result.output) };
        }
        case "downloadFile": {
          const fileId = pickString(args.fileId, args.file_id, args.id);
          if (!fileId) return { ok: false, error: "Missing file id." };
          const result = await runTool(
            ctx,
            "gdrive.download",
            {
              fileId,
              mimeType: pickString(args.mimeType, args.mime_type),
            },
            false,
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
