/**
 * Google Drive ConnectorViewAdapter — list / create / preview via Composio.
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

/** Export mime for Google Workspace types so previews are readable. */
export function exportMimeForDriveFile(sourceMime: string | undefined): string | undefined {
  switch (sourceMime) {
    case "application/vnd.google-apps.document":
      return "text/plain";
    case "application/vnd.google-apps.spreadsheet":
      return "text/csv";
    case "application/vnd.google-apps.presentation":
      return "text/plain";
    case "application/vnd.google-apps.drawing":
      return "image/png";
    default:
      return undefined;
  }
}

function isTextishMime(mime: string | undefined): boolean {
  if (!mime) return false;
  return (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/javascript" ||
    mime === "application/csv" ||
    mime.includes("markdown")
  );
}

function isImageMime(mime: string | undefined): boolean {
  return Boolean(mime?.startsWith("image/"));
}

function isPdfMime(mime: string | undefined): boolean {
  return mime === "application/pdf";
}

async function fetchTextPreview(url: string, maxChars = 48_000): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars)}\n\n…preview truncated`;
  } catch {
    return null;
  }
}

function normalizeDownloadPreview(payload: Record<string, unknown>): Record<string, unknown> {
  const downloaded =
    payload.downloaded_file_content &&
    typeof payload.downloaded_file_content === "object"
      ? (payload.downloaded_file_content as Record<string, unknown>)
      : null;

  const displayUrl =
    pickString(
      payload.display_url,
      payload.displayUrl,
      payload.export_link,
      payload.exportLink,
      downloaded?.s3url,
      downloaded?.s3Url,
      downloaded?.url,
    ) ?? null;

  const mimeType =
    pickString(
      downloaded?.mimetype,
      downloaded?.mimeType,
      payload.mimeType,
      payload.mime_type,
    ) ?? "application/octet-stream";

  const name =
    pickString(payload.name, downloaded?.name) ?? "File";

  let previewKind: "text" | "image" | "pdf" | "link" | "unsupported" = "unsupported";
  if (isTextishMime(mimeType)) previewKind = "text";
  else if (isImageMime(mimeType)) previewKind = "image";
  else if (isPdfMime(mimeType)) previewKind = "pdf";
  else if (displayUrl) previewKind = "link";

  return {
    id: pickString(payload.id) ?? null,
    name,
    mimeType,
    displayUrl,
    previewKind,
    linkLabel: pickString(payload.link_label, payload.linkLabel) ?? "Open file",
    exportApplied: Boolean(payload.export_applied ?? payload.exportApplied),
    raw: payload,
  };
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
          const sourceMime = pickString(
            args.sourceMimeType,
            args.source_mime_type,
            args.mimeType,
            args.mime_type,
          );
          const exportMime =
            pickString(args.exportMimeType, args.export_mime_type) ||
            exportMimeForDriveFile(sourceMime);
          const result = await runTool(
            ctx,
            "gdrive.download",
            {
              fileId,
              mimeType: exportMime,
            },
            false,
          );
          if (!result.ok) return { ok: false, error: result.error };
          const payload = parseToolJson(result.output);
          const preview = normalizeDownloadPreview(payload);

          if (
            preview.previewKind === "text" &&
            typeof preview.displayUrl === "string" &&
            preview.displayUrl
          ) {
            const text = await fetchTextPreview(preview.displayUrl);
            if (text != null) {
              preview.textContent = text;
            }
          }

          return { ok: true, data: preview };
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
