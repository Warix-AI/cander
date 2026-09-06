/**
 * Factory: ConnectorViewAdapter for app connector panels.
 */

import { executeConnectorTool } from "../tool-execute.ts";
import { createSupabaseAdminClient } from "../../supabase/admin.ts";
import {
  APP_CONNECTOR_DEFINITIONS,
  appConnectorById,
  normalizeItemsForConnector,
} from "../apps/definitions.ts";
import type {
  ActionContext,
  ActionResult,
  ConnectorViewAdapter,
  SyncContext,
  SyncResult,
} from "../sdk/types.ts";

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

export function createAppViewAdapter(connectorId: string): ConnectorViewAdapter {
  const def = appConnectorById(connectorId);
  if (!def) throw new Error(`Unknown app connector: ${connectorId}`);

  return {
    connectorId,
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
        if (action === "listItems") {
          const query =
            typeof args.query === "string" ? args.query.trim() : "";
          const tool =
            query && def.searchProvider
              ? `${connectorId}.search`
              : `${connectorId}.list`;
          const result = await runTool(ctx, tool, args);
          if (!result.ok) return { ok: false, error: result.error };
          const payload = parseToolJson(result.output);
          return {
            ok: true,
            data: {
              items: normalizeItemsForConnector(connectorId, payload),
              raw: payload,
            },
          };
        }

        if (action === "getItem") {
          if (!def.getProvider) {
            return { ok: false, error: "Detail view is not available." };
          }
          const result = await runTool(ctx, `${connectorId}.get`, args);
          if (!result.ok) return { ok: false, error: result.error };
          return { ok: true, data: parseToolJson(result.output) };
        }

        return { ok: false, error: `Unsupported action: ${action}` };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Operation failed.",
        };
      }
    },
  };
}

export const APP_VIEW_ADAPTERS = APP_CONNECTOR_DEFINITIONS.map((def) =>
  createAppViewAdapter(def.id),
);
