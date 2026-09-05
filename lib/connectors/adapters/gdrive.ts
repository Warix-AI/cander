/**
 * Google Drive connector adapter — Composio slug/arg/result mapping.
 */

import { GDRIVE_COMPOSIO_SLUGS } from "../google-workspace-composio.ts";
import {
  buildSuccessResult,
  pickString,
  unwrapProviderData,
  type ConnectorAdapter,
} from "./types.ts";

type GdriveToolName = keyof typeof GDRIVE_COMPOSIO_SLUGS;

function isGdriveTool(toolId: string): toolId is GdriveToolName {
  return toolId in GDRIVE_COMPOSIO_SLUGS;
}

function mapGdriveArguments(
  toolId: GdriveToolName,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (toolId === "gdrive.find") {
    const out: Record<string, unknown> = {
      pageSize: Math.min(100, Math.max(1, Number(args.maxResults) || 40)),
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: "allDrives",
    };
    const query = pickString(args.query, args.q);
    if (query) out.q = query;
    else out.q = "trashed = false";
    const folderId = pickString(args.folderId, args.folder_id, args.parentId);
    if (folderId) out.folder_id = folderId;
    const orderBy = pickString(args.orderBy, args.order_by);
    if (orderBy) out.orderBy = orderBy;
    else if (!query || !/fullText\s+contains/i.test(query)) {
      out.orderBy = "modifiedTime desc";
    }
    return out;
  }

  if (toolId === "gdrive.createFromText") {
    const name = pickString(args.name, args.file_name, args.title);
    if (!name) throw new Error("Missing required argument: name");
    const content = pickString(args.content, args.text_content, args.text, args.body);
    if (!content) throw new Error("Missing required argument: content");
    const out: Record<string, unknown> = {
      file_name: name,
      text_content: content,
      mime_type: pickString(args.mimeType, args.mime_type) || "text/plain",
    };
    const parentId = pickString(args.parentId, args.parent_id, args.folderId);
    if (parentId) out.parent_id = parentId;
    return out;
  }

  if (toolId === "gdrive.createFolder") {
    const name = pickString(args.name, args.title);
    if (!name) throw new Error("Missing required argument: name");
    const out: Record<string, unknown> = { name };
    const parentId = pickString(args.parentId, args.parent_id, args.folderId);
    if (parentId) out.parent_id = parentId;
    return out;
  }

  if (toolId === "gdrive.download") {
    const fileId = pickString(args.fileId, args.file_id, args.id);
    if (!fileId) throw new Error("Missing required argument: fileId");
    const out: Record<string, unknown> = { fileId };
    const mime = pickString(args.mimeType, args.mime_type);
    if (mime) out.mime_type = mime;
    return out;
  }

  if (toolId === "gdrive.createFile") {
    return { ...args };
  }

  if (toolId === "gdrive.upload") {
    return { ...args };
  }

  if (toolId === "gdrive.edit") {
    return { ...args };
  }

  if (toolId === "gdrive.share") {
    return { ...args };
  }

  return { ...args };
}

export const gdriveAdapter: ConnectorAdapter = {
  connectorId: "gdrive",

  mapArguments(toolId, args) {
    if (!isGdriveTool(toolId)) {
      throw new Error(`Unsupported Drive tool: ${toolId}`);
    }
    return mapGdriveArguments(toolId, args);
  },

  providerSlug(toolId) {
    if (!isGdriveTool(toolId)) {
      throw new Error(`Unsupported Drive tool: ${toolId}`);
    }
    return GDRIVE_COMPOSIO_SLUGS[toolId];
  },

  normalizeResult(input) {
    if (!isGdriveTool(input.toolId)) {
      throw new Error(`Unsupported Drive tool: ${input.toolId}`);
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
