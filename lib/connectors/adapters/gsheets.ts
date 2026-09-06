/**
 * Google Sheets connector adapter — Composio slug/arg/result mapping.
 */

import { GSHEETS_COMPOSIO_SLUGS } from "../google-workspace-composio.ts";
import {
  buildSuccessResult,
  pickString,
  unwrapProviderData,
  type ConnectorAdapter,
} from "./types.ts";

type GsheetsToolName = keyof typeof GSHEETS_COMPOSIO_SLUGS;

function isGsheetsTool(toolId: string): toolId is GsheetsToolName {
  return toolId in GSHEETS_COMPOSIO_SLUGS;
}

function mapGsheetsArguments(
  toolId: GsheetsToolName,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (toolId === "gsheets.search") {
    const out: Record<string, unknown> = {
      max_results: Math.min(100, Math.max(1, Number(args.maxResults) || 20)),
      order_by: pickString(args.orderBy, args.order_by) || "modifiedTime desc",
    };
    const query = pickString(args.query, args.q);
    if (query) {
      out.query =
        /contains|trashed|=/i.test(query) ? query : `name contains '${query.replace(/'/g, "\\'")}'`;
    }
    return out;
  }

  if (toolId === "gsheets.info" || toolId === "gsheets.sheetNames") {
    const spreadsheetId = pickString(
      args.spreadsheetId,
      args.spreadsheet_id,
      args.id,
    );
    if (!spreadsheetId) throw new Error("Missing required argument: spreadsheetId");
    return { spreadsheet_id: spreadsheetId };
  }

  if (toolId === "gsheets.valuesGet") {
    const spreadsheetId = pickString(
      args.spreadsheetId,
      args.spreadsheet_id,
      args.id,
    );
    if (!spreadsheetId) throw new Error("Missing required argument: spreadsheetId");
    const range = pickString(args.range, args.a1);
    if (!range) throw new Error("Missing required argument: range");
    return { spreadsheet_id: spreadsheetId, ranges: [range] };
  }

  if (toolId === "gsheets.batchGet") {
    const spreadsheetId = pickString(
      args.spreadsheetId,
      args.spreadsheet_id,
      args.id,
    );
    if (!spreadsheetId) throw new Error("Missing required argument: spreadsheetId");
    let ranges: string[] = [];
    if (Array.isArray(args.ranges)) {
      ranges = args.ranges.map(String).map((s) => s.trim()).filter(Boolean);
    } else {
      const raw = pickString(args.ranges, args.range);
      if (raw) {
        ranges = raw.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }
    if (ranges.length === 0) throw new Error("Missing required argument: ranges");
    return { spreadsheet_id: spreadsheetId, ranges };
  }

  if (toolId === "gsheets.create") {
    const title = pickString(args.title, args.name) || "Untitled spreadsheet";
    return { title };
  }

  return { ...args };
}

export const gsheetsAdapter: ConnectorAdapter = {
  connectorId: "gsheets",

  mapArguments(toolId, args) {
    if (!isGsheetsTool(toolId)) {
      throw new Error(`Unsupported Sheets tool: ${toolId}`);
    }
    return mapGsheetsArguments(toolId, args);
  },

  providerSlug(toolId) {
    if (!isGsheetsTool(toolId)) {
      throw new Error(`Unsupported Sheets tool: ${toolId}`);
    }
    return GSHEETS_COMPOSIO_SLUGS[toolId];
  },

  normalizeResult(input) {
    if (!isGsheetsTool(input.toolId)) {
      throw new Error(`Unsupported Sheets tool: ${input.toolId}`);
    }
    const data = unwrapProviderData(input.raw);
    return buildSuccessResult({
      toolId: input.toolId,
      toolCallId: input.toolCallId,
      idempotencyKey: input.idempotencyKey,
      connectionId: input.connectionId,
      data,
    });
  },
};
