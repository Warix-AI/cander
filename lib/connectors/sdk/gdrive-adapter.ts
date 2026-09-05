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

/** Browser-friendly Google preview URLs (same Google session as the user). */
export function embedUrlForDriveFile(
  fileId: string,
  sourceMime: string | undefined,
): string {
  switch (sourceMime) {
    case "application/vnd.google-apps.document":
      return `https://docs.google.com/document/d/${encodeURIComponent(fileId)}/preview`;
    case "application/vnd.google-apps.spreadsheet":
      return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(fileId)}/preview`;
    case "application/vnd.google-apps.presentation":
      return `https://docs.google.com/presentation/d/${encodeURIComponent(fileId)}/embed?start=false&loop=false&delayms=60000`;
    case "application/vnd.google-apps.drawing":
      return `https://docs.google.com/drawings/d/${encodeURIComponent(fileId)}/preview`;
    case "application/vnd.google-apps.form":
      return `https://docs.google.com/forms/d/${encodeURIComponent(fileId)}/viewform`;
    default:
      return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
  }
}

export function openUrlForDriveFile(
  fileId: string,
  sourceMime: string | undefined,
  webViewLink?: string | null,
): string {
  if (webViewLink) return webViewLink;
  switch (sourceMime) {
    case "application/vnd.google-apps.document":
      return `https://docs.google.com/document/d/${encodeURIComponent(fileId)}/edit`;
    case "application/vnd.google-apps.spreadsheet":
      return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(fileId)}/edit`;
    case "application/vnd.google-apps.presentation":
      return `https://docs.google.com/presentation/d/${encodeURIComponent(fileId)}/edit`;
    default:
      return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
  }
}

/** Export mime for Google Workspace types so text previews are readable. */
export function exportMimeForDriveFile(sourceMime: string | undefined): string | undefined {
  switch (sourceMime) {
    case "application/vnd.google-apps.document":
      return "text/html";
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
    mime.includes("markdown") ||
    mime.includes("html")
  );
}

function isImageMime(mime: string | undefined): boolean {
  return Boolean(mime?.startsWith("image/"));
}

function isPdfMime(mime: string | undefined): boolean {
  return mime === "application/pdf";
}

function isVideoMime(mime: string | undefined): boolean {
  return Boolean(mime?.startsWith("video/"));
}

function isAudioMime(mime: string | undefined): boolean {
  return Boolean(mime?.startsWith("audio/"));
}

async function fetchTextPreview(url: string, maxChars = 64_000): Promise<string | null> {
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

function htmlToPlainPreview(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeDownloadPreview(input: {
  payload: Record<string, unknown>;
  fileId: string;
  sourceMime?: string;
  webViewLink?: string;
}): Record<string, unknown> {
  const { payload, fileId, sourceMime, webViewLink } = input;
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
      sourceMime,
    ) ?? "application/octet-stream";

  const name = pickString(payload.name, downloaded?.name) ?? "File";
  const embedUrl = embedUrlForDriveFile(fileId, sourceMime);
  const openUrl = openUrlForDriveFile(fileId, sourceMime, webViewLink);

  let previewKind:
    | "text"
    | "image"
    | "pdf"
    | "video"
    | "audio"
    | "embed"
    | "link"
    | "unsupported" = "embed";

  if (isTextishMime(mimeType) && displayUrl) previewKind = "text";
  else if (isImageMime(mimeType) && displayUrl) previewKind = "image";
  else if (isPdfMime(mimeType) && displayUrl) previewKind = "pdf";
  else if (isVideoMime(mimeType) || isVideoMime(sourceMime)) previewKind = "video";
  else if (isAudioMime(mimeType) && displayUrl) previewKind = "audio";
  else if (displayUrl && !sourceMime?.startsWith("application/vnd.google-apps.")) {
    // Native binary with a downloadable URL — still embed Drive preview as fallback UI.
    if (isImageMime(sourceMime)) previewKind = "image";
    else if (isPdfMime(sourceMime)) previewKind = "pdf";
    else previewKind = "embed";
  }

  const isVideo = previewKind === "video";

  return {
    id: pickString(payload.id) ?? fileId,
    name,
    mimeType,
    sourceMimeType: sourceMime ?? null,
    displayUrl,
    embedUrl: isVideo ? null : embedUrl,
    openUrl,
    previewKind,
    linkLabel: pickString(payload.link_label, payload.linkLabel) ?? "Open in Drive",
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
          const webViewLink = pickString(args.webViewLink, args.web_view_link);
          const exportMime =
            pickString(args.exportMimeType, args.export_mime_type) ||
            exportMimeForDriveFile(sourceMime);

          // Always return an embeddable Google preview so the UI can show something
          // even when Composio download fails (access, size, format). Videos skip
          // Drive iframe embeds — they spin forever and don't allow clean replay.
          const isVideo = isVideoMime(sourceMime);
          const fallback = {
            id: fileId,
            name: pickString(args.name) ?? "File",
            mimeType: sourceMime ?? "application/octet-stream",
            sourceMimeType: sourceMime ?? null,
            displayUrl: null as string | null,
            embedUrl: isVideo ? null : embedUrlForDriveFile(fileId, sourceMime),
            openUrl: openUrlForDriveFile(fileId, sourceMime, webViewLink),
            previewKind: (isVideo ? "video" : "embed") as "video" | "embed",
            linkLabel: "Open in Drive",
            exportApplied: false,
          };

          const result = await runTool(
            ctx,
            "gdrive.download",
            {
              fileId,
              mimeType: exportMime,
            },
            false,
          );

          if (!result.ok) {
            return { ok: true, data: fallback };
          }

          const payload = parseToolJson(result.output);
          const preview = normalizeDownloadPreview({
            payload,
            fileId,
            sourceMime,
            webViewLink,
          });

          if (
            preview.previewKind === "text" &&
            typeof preview.displayUrl === "string" &&
            preview.displayUrl
          ) {
            const rawText = await fetchTextPreview(preview.displayUrl);
            if (rawText != null) {
              const mime = String(preview.mimeType ?? "");
              preview.textContent = mime.includes("html")
                ? htmlToPlainPreview(rawText)
                : rawText;
            } else {
              // Keep Google embed if text fetch failed.
              preview.previewKind = "embed";
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
