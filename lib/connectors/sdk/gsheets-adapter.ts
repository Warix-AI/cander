/**
 * Google Sheets ConnectorViewAdapter — list / tabs / values / create via Composio.
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

function extractValueGrid(payload: Record<string, unknown>): string[][] {
  const valueRanges = Array.isArray(payload.valueRanges)
    ? payload.valueRanges
    : Array.isArray(payload.value_ranges)
      ? payload.value_ranges
      : null;
  if (valueRanges?.[0] && typeof valueRanges[0] === "object") {
    const values = (valueRanges[0] as Record<string, unknown>).values;
    if (Array.isArray(values)) {
      return values.map((row) =>
        Array.isArray(row)
          ? row.map((cell) => String(cell ?? ""))
          : [String(row ?? "")],
      );
    }
  }
  if (Array.isArray(payload.values)) {
    return payload.values.map((row) =>
      Array.isArray(row)
        ? row.map((cell) => String(cell ?? ""))
        : [String(row ?? "")],
    );
  }
  const data = payload.data;
  if (data && typeof data === "object") {
    return extractValueGrid(data as Record<string, unknown>);
  }
  return [];
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

function extractList(payload: Record<string, unknown>): unknown[] {
  if (Array.isArray(payload.files)) return payload.files;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.spreadsheets)) return payload.spreadsheets;
  if (Array.isArray(payload.documents)) return payload.documents;
  const data = payload.data;
  if (data && typeof data === "object") {
    const inner = data as Record<string, unknown>;
    if (Array.isArray(inner.files)) return inner.files;
    if (Array.isArray(inner.items)) return inner.items;
    if (Array.isArray(inner.spreadsheets)) return inner.spreadsheets;
    if (Array.isArray(inner.documents)) return inner.documents;
  }
  return [];
}

function extractSheetNames(payload: Record<string, unknown>): string[] {
  if (Array.isArray(payload.sheet_names)) {
    return payload.sheet_names.map(String).filter(Boolean);
  }
  if (Array.isArray(payload.sheetNames)) {
    return payload.sheetNames.map(String).filter(Boolean);
  }
  if (Array.isArray(payload.sheets)) {
    return payload.sheets
      .map((sheet) => {
        if (typeof sheet === "string") return sheet;
        if (sheet && typeof sheet === "object") {
          const row = sheet as Record<string, unknown>;
          const props =
            row.properties && typeof row.properties === "object"
              ? (row.properties as Record<string, unknown>)
              : row;
          return pickString(props.title, props.name, row.title, row.name);
        }
        return undefined;
      })
      .filter((name): name is string => Boolean(name));
  }
  const data = payload.data;
  if (data && typeof data === "object") {
    return extractSheetNames(data as Record<string, unknown>);
  }
  return [];
}

export const gsheetsViewAdapter: ConnectorViewAdapter = {
  connectorId: "gsheets",
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
        case "searchSpreadsheets": {
          const result = await runTool(ctx, "gsheets.search", args);
          if (!result.ok) return { ok: false, error: result.error };
          const payload = parseToolJson(result.output);
          return {
            ok: true,
            data: {
              spreadsheets: extractList(payload),
              raw: payload,
            },
          };
        }
        case "getSheetNames": {
          const spreadsheetId = pickString(
            args.spreadsheetId,
            args.spreadsheet_id,
            args.id,
          );
          if (!spreadsheetId) {
            return { ok: false, error: "Missing spreadsheet id." };
          }
          const result = await runTool(ctx, "gsheets.sheetNames", {
            spreadsheetId,
          });
          if (!result.ok) return { ok: false, error: result.error };
          const payload = parseToolJson(result.output);
          return {
            ok: true,
            data: {
              sheetNames: extractSheetNames(payload),
              raw: payload,
            },
          };
        }
        case "getValues": {
          const spreadsheetId = pickString(
            args.spreadsheetId,
            args.spreadsheet_id,
            args.id,
          );
          if (!spreadsheetId) {
            return { ok: false, error: "Missing spreadsheet id." };
          }
          const range = pickString(args.range, args.a1);
          if (!range) return { ok: false, error: "Missing range." };
          const result = await runTool(ctx, "gsheets.valuesGet", {
            spreadsheetId,
            range,
          });
          if (!result.ok) return { ok: false, error: result.error };
          const payload = parseToolJson(result.output);
          return {
            ok: true,
            data: {
              ...payload,
              values: extractValueGrid(payload),
            },
          };
        }
        case "createSpreadsheet": {
          const title = pickString(args.title, args.name) || "Untitled spreadsheet";
          const result = await runTool(
            ctx,
            "gsheets.create",
            { title },
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
