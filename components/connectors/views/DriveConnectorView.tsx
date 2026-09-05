"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  ExternalLink,
  File,
  FileSpreadsheet,
  FileText,
  Folder,
  Image as ImageIcon,
  Loader2,
  Presentation,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
  WorkspaceEmptyState,
  WorkspaceField,
  WorkspaceListRow,
  WorkspacePanelFrame,
  type WorkspaceToolbarState,
} from "@/components/connectors/views/WorkspaceViewChrome";
import { runConnectorViewOperation } from "@/lib/api/connector-client";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

type Page = "browse" | "detail" | "create";

type DriveFile = {
  id: string;
  name: string;
  kind: "file" | "folder";
  mimeType: string;
  modified: string;
  owner?: string;
  webViewLink?: string;
  sizeLabel?: string;
};

type FolderCrumb = { id: string; name: string };

type FilePreview = {
  previewKind: "text" | "image" | "pdf" | "link" | "unsupported";
  mimeType: string;
  displayUrl: string | null;
  textContent?: string;
  linkLabel?: string;
  name: string;
};

function isFolderMime(mime: string) {
  return mime === "application/vnd.google-apps.folder";
}

function formatModified(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatBytes(value: unknown): string | undefined {
  const n = typeof value === "string" ? Number(value) : Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function parseDriveFile(raw: unknown): DriveFile | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : null;
  if (!id) return null;
  const name =
    (typeof row.name === "string" && row.name) ||
    (typeof row.title === "string" && row.title) ||
    "Untitled";
  const mimeType =
    (typeof row.mimeType === "string" && row.mimeType) ||
    (typeof row.mime_type === "string" && row.mime_type) ||
    "application/octet-stream";
  const modifiedRaw =
    (typeof row.modifiedTime === "string" && row.modifiedTime) ||
    (typeof row.modified_time === "string" && row.modified_time) ||
    null;
  let owner: string | undefined;
  if (Array.isArray(row.owners) && row.owners[0] && typeof row.owners[0] === "object") {
    const first = row.owners[0] as Record<string, unknown>;
    owner =
      (typeof first.displayName === "string" && first.displayName) ||
      (typeof first.emailAddress === "string" && first.emailAddress) ||
      undefined;
  } else if (typeof row.owner === "string") {
    owner = row.owner;
  }
  return {
    id,
    name,
    mimeType,
    kind: isFolderMime(mimeType) ? "folder" : "file",
    modified: formatModified(modifiedRaw),
    owner,
    sizeLabel: formatBytes(row.size ?? row.quotaBytesUsed),
    webViewLink:
      (typeof row.webViewLink === "string" && row.webViewLink) ||
      (typeof row.web_view_link === "string" && row.web_view_link) ||
      undefined,
  };
}

function fileIcon(mime: string, kind: "file" | "folder") {
  if (kind === "folder") return Folder;
  if (mime === "application/vnd.google-apps.document") return FileText;
  if (mime === "application/vnd.google-apps.spreadsheet") return FileSpreadsheet;
  if (mime === "application/vnd.google-apps.presentation") return Presentation;
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime.includes("pdf") || mime.includes("text")) return FileText;
  return File;
}

function typeLabel(mime: string, kind: "file" | "folder") {
  if (kind === "folder") return "Folder";
  if (mime === "application/vnd.google-apps.document") return "Google Doc";
  if (mime === "application/vnd.google-apps.spreadsheet") return "Google Sheet";
  if (mime === "application/vnd.google-apps.presentation") return "Google Slides";
  if (mime === "application/vnd.google-apps.drawing") return "Drawing";
  if (mime.startsWith("image/")) return "Image";
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("text/") || mime.includes("csv")) return "Text";
  return "File";
}

function parsePreview(data: Record<string, unknown>, fallbackName: string): FilePreview {
  const kind = data.previewKind;
  const previewKind =
    kind === "text" ||
    kind === "image" ||
    kind === "pdf" ||
    kind === "link" ||
    kind === "unsupported"
      ? kind
      : "unsupported";
  return {
    previewKind,
    mimeType:
      (typeof data.mimeType === "string" && data.mimeType) ||
      "application/octet-stream",
    displayUrl: typeof data.displayUrl === "string" ? data.displayUrl : null,
    textContent:
      typeof data.textContent === "string" ? data.textContent : undefined,
    linkLabel:
      typeof data.linkLabel === "string" ? data.linkLabel : "Open file",
    name:
      (typeof data.name === "string" && data.name) || fallbackName,
  };
}

export function DriveConnectorView({
  onToolbarChange,
}: {
  onToolbarChange?: (state: WorkspaceToolbarState) => void;
}) {
  const { workspaceId } = useApp();
  const [page, setPage] = useState<Page>("browse");
  const [folderStack, setFolderStack] = useState<FolderCrumb[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selected, setSelected] = useState<DriveFile | null>(null);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [createMode, setCreateMode] = useState<"file" | "folder">("file");

  const currentFolderId = folderStack[folderStack.length - 1]?.id ?? null;
  const locationTitle = folderStack.length
    ? folderStack[folderStack.length - 1]!.name
    : "My Drive";

  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }, [files]);

  const loadFiles = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const needle = query.trim();
      const result = await runConnectorViewOperation({
        workspaceId,
        connectorId: "gdrive",
        operation: "findFiles",
        input: {
          folderId: currentFolderId || undefined,
          query: needle
            ? needle.includes("=") || needle.includes("contains")
              ? needle
              : `name contains '${needle.replace(/'/g, "\\'")}' and trashed = false`
            : currentFolderId
              ? "trashed = false"
              : undefined,
          maxResults: 60,
        },
      });
      const rawFiles = Array.isArray(result.data.files) ? result.data.files : [];
      const parsed = rawFiles
        .map(parseDriveFile)
        .filter((file): file is DriveFile => Boolean(file));
      setFiles(parsed);
      setStatus(
        parsed.length
          ? null
          : needle
            ? "No matching files."
            : "This folder is empty.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load Drive. Connect Google Drive and try again.",
      );
      setFiles([]);
      setStatus(null);
    } finally {
      setSyncing(false);
    }
  }, [currentFolderId, query, workspaceId]);

  useEffect(() => {
    if (page === "browse") void loadFiles();
  }, [loadFiles, page]);

  const openFolder = useCallback((folder: DriveFile) => {
    setQuery("");
    setSelected(null);
    setPreview(null);
    setError(null);
    setStatus(null);
    setFolderStack((stack) => [...stack, { id: folder.id, name: folder.name }]);
    setPage("browse");
  }, []);

  const openFile = useCallback(
    async (file: DriveFile) => {
      setSelected(file);
      setPreview(null);
      setError(null);
      setStatus(null);
      setPage("detail");
      setPreviewLoading(true);
      try {
        const result = await runConnectorViewOperation({
          workspaceId,
          connectorId: "gdrive",
          operation: "downloadFile",
          input: {
            fileId: file.id,
            sourceMimeType: file.mimeType,
          },
        });
        setPreview(parsePreview(result.data, file.name));
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load a preview for this file.",
        );
        setPreview({
          previewKind: "unsupported",
          mimeType: file.mimeType,
          displayUrl: file.webViewLink ?? null,
          name: file.name,
          linkLabel: "Open in Drive",
        });
      } finally {
        setPreviewLoading(false);
      }
    },
    [workspaceId],
  );

  const goToCrumb = useCallback((index: number) => {
    setQuery("");
    setSelected(null);
    setPreview(null);
    setError(null);
    setStatus(null);
    setFolderStack((stack) => (index < 0 ? [] : stack.slice(0, index + 1)));
    setPage("browse");
  }, []);

  const createItem = useCallback(async () => {
    if (!name.trim()) {
      setError(createMode === "folder" ? "Add a folder name." : "Add a file name.");
      return;
    }
    if (createMode === "file" && !content.trim()) {
      setError("Add some file content.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (createMode === "folder") {
        await runConnectorViewOperation({
          workspaceId,
          connectorId: "gdrive",
          operation: "createFolder",
          input: {
            name: name.trim(),
            parentId: currentFolderId || undefined,
          },
        });
        setStatus("Folder created");
      } else {
        await runConnectorViewOperation({
          workspaceId,
          connectorId: "gdrive",
          operation: "createFromText",
          input: {
            name: name.trim(),
            content: content.trim(),
            parentId: currentFolderId || undefined,
          },
        });
        setStatus("File created");
      }
      setName("");
      setContent("");
      setPage("browse");
      await loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create item.");
    } finally {
      setBusy(false);
    }
  }, [content, createMode, currentFolderId, loadFiles, name, workspaceId]);

  useEffect(() => {
    onToolbarChange?.({
      title:
        page === "create"
          ? createMode === "folder"
            ? "New folder"
            : "New file"
          : page === "detail"
            ? selected?.name ?? "File"
            : locationTitle,
      syncing: syncing || previewLoading,
      busy,
      canGoBack: page !== "browse" || folderStack.length > 0,
      backLabel:
        page === "detail" || page === "create"
          ? locationTitle
          : folderStack.length > 1
            ? folderStack[folderStack.length - 2]!.name
            : "My Drive",
      primaryLabel:
        page === "browse" ? "New" : page === "create" ? "Create" : null,
      onBack: () => {
        if (page === "detail" || page === "create") {
          setPage("browse");
          setSelected(null);
          setPreview(null);
          setError(null);
          return;
        }
        setFolderStack((stack) => stack.slice(0, -1));
        setQuery("");
        setError(null);
      },
      onRefresh: () => {
        if (page === "detail" && selected) {
          void openFile(selected);
          return;
        }
        void loadFiles();
      },
      onPrimary:
        page === "browse"
          ? () => {
              setCreateMode("file");
              setName("");
              setContent("");
              setError(null);
              setStatus(null);
              setPage("create");
            }
          : page === "create"
            ? () => {
                void createItem();
              }
            : null,
    });
  }, [
    busy,
    createItem,
    createMode,
    folderStack,
    loadFiles,
    locationTitle,
    onToolbarChange,
    openFile,
    page,
    previewLoading,
    selected,
    syncing,
  ]);

  return (
    <WorkspacePanelFrame status={status} error={error}>
      {page === "create" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCreateMode("file")}
              className={cn(
                "inline-flex h-8 items-center px-3 text-[12px] font-medium",
                SHELL_G3_RADIUS,
                createMode === "file"
                  ? "bg-foreground text-background"
                  : "border border-border text-muted-foreground hover:bg-muted",
              )}
            >
              File
            </button>
            <button
              type="button"
              onClick={() => setCreateMode("folder")}
              className={cn(
                "inline-flex h-8 items-center px-3 text-[12px] font-medium",
                SHELL_G3_RADIUS,
                createMode === "folder"
                  ? "bg-foreground text-background"
                  : "border border-border text-muted-foreground hover:bg-muted",
              )}
            >
              Folder
            </button>
          </div>
          {currentFolderId ? (
            <p className="text-[12px] text-muted-foreground">
              Creating in <span className="font-medium text-foreground">{locationTitle}</span>
            </p>
          ) : null}
          <WorkspaceField
            label="Name"
            value={name}
            onChange={setName}
            placeholder={createMode === "folder" ? "Project files" : "notes.txt"}
          />
          {createMode === "file" ? (
            <label className="block">
              <span className="text-[11px] font-medium text-muted-foreground">
                Content
              </span>
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={8}
                className="mt-1 w-full resize-none rounded-[10px] border border-border bg-white px-3 py-2 text-[13px] outline-none dark:bg-space-canvas"
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {page === "detail" && selected ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-black/5 px-4 py-3 dark:border-white/10">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center bg-[#1A73E8]/10 text-[#1A73E8]",
                  SHELL_G3_RADIUS,
                )}
              >
                {(() => {
                  const Icon = fileIcon(selected.mimeType, selected.kind);
                  return <Icon className="h-5 w-5" strokeWidth={1.7} />;
                })()}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[16px] font-semibold tracking-[-0.02em]">
                  {selected.name}
                </h2>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {typeLabel(selected.mimeType, selected.kind)}
                  {selected.modified ? ` · ${selected.modified}` : ""}
                  {selected.sizeLabel ? ` · ${selected.sizeLabel}` : ""}
                </p>
                {selected.owner ? (
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                    {selected.owner}
                  </p>
                ) : null}
              </div>
              {(selected.webViewLink || preview?.displayUrl) && (
                <a
                  href={selected.webViewLink || preview?.displayUrl || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 border border-border px-3 text-[12px] font-medium hover:bg-muted",
                    SHELL_G3_RADIUS,
                  )}
                >
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.6} />
                  Drive
                </a>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {previewLoading ? (
              <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 px-4 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.7} />
                <p className="text-[12px]">Loading preview…</p>
              </div>
            ) : preview?.previewKind === "text" && preview.textContent ? (
              <pre className="whitespace-pre-wrap break-words px-4 py-4 font-mono text-[12.5px] leading-relaxed text-foreground/90">
                {preview.textContent}
              </pre>
            ) : preview?.previewKind === "image" && preview.displayUrl ? (
              <div className="flex min-h-full items-center justify-center bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview.displayUrl}
                  alt={preview.name}
                  className={cn(
                    "max-h-full max-w-full object-contain shadow-sm ring-1 ring-black/5 dark:ring-white/10",
                    SHELL_G3_RADIUS,
                  )}
                />
              </div>
            ) : preview?.previewKind === "pdf" && preview.displayUrl ? (
              <iframe
                title={preview.name}
                src={preview.displayUrl}
                className="h-full min-h-[24rem] w-full border-0 bg-muted/20"
              />
            ) : (
              <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                <div
                  className={cn(
                    "flex h-12 w-12 items-center justify-center bg-muted text-muted-foreground",
                    SHELL_G3_RADIUS,
                  )}
                >
                  <File className="h-5 w-5" strokeWidth={1.7} />
                </div>
                <div>
                  <p className="text-[13px] font-medium">
                    Preview isn’t available for this format
                  </p>
                  <p className="mt-1 max-w-sm text-[12px] text-muted-foreground">
                    Open it in Google Drive to view or edit. Docs, Sheets, text,
                    images, and PDFs preview here when export is supported.
                  </p>
                </div>
                {(selected.webViewLink || preview?.displayUrl) && (
                  <a
                    href={selected.webViewLink || preview?.displayUrl || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 bg-foreground px-4 text-[12px] font-medium text-background hover:opacity-90",
                      SHELL_G3_RADIUS,
                    )}
                  >
                    <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.6} />
                    {preview?.linkLabel || "Open in Drive"}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {page === "browse" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 space-y-2 border-b border-black/5 px-3 py-2 dark:border-white/10">
            <nav
              aria-label="Drive location"
              className="flex min-w-0 items-center gap-0.5 overflow-x-auto text-[12px]"
            >
              <button
                type="button"
                onClick={() => goToCrumb(-1)}
                className={cn(
                  "shrink-0 rounded-md px-1.5 py-0.5 font-medium transition-colors",
                  folderStack.length === 0
                    ? "text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                My Drive
              </button>
              {folderStack.map((crumb, index) => (
                <span key={crumb.id} className="flex min-w-0 items-center gap-0.5">
                  <ChevronRight
                    className="h-3 w-3 shrink-0 text-muted-foreground/70"
                    strokeWidth={1.8}
                  />
                  <button
                    type="button"
                    onClick={() => goToCrumb(index)}
                    className={cn(
                      "max-w-[9rem] truncate rounded-md px-1.5 py-0.5 font-medium transition-colors",
                      index === folderStack.length - 1
                        ? "text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
            </nav>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void loadFiles();
              }}
              placeholder={
                currentFolderId ? "Search in this folder…" : "Search Drive…"
              }
              className={cn(
                "h-8 w-full border border-border bg-transparent px-3 text-[13px] outline-none",
                SHELL_G3_RADIUS,
              )}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!sortedFiles.length ? (
              <WorkspaceEmptyState
                title={syncing ? "Loading Drive…" : "Nothing here yet"}
                body={
                  error
                    ? "Connect Google Drive in Connectors, then refresh."
                    : currentFolderId
                      ? "This folder is empty. Create a file or go back."
                      : "Search or create a file to get started."
                }
                actionLabel={syncing ? "Loading…" : "Refresh"}
                syncing={syncing}
                onAction={() => void loadFiles()}
              />
            ) : (
              sortedFiles.map((file) => {
                const Icon = fileIcon(file.mimeType, file.kind);
                return (
                  <WorkspaceListRow
                    key={file.id}
                    title={file.name}
                    subtitle={[
                      typeLabel(file.mimeType, file.kind),
                      file.owner,
                      file.sizeLabel,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    meta={file.modified}
                    active={selected?.id === file.id}
                    onClick={() => {
                      if (file.kind === "folder") openFolder(file);
                      else void openFile(file);
                    }}
                    leading={
                      <div
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center",
                          SHELL_G3_RADIUS,
                          file.kind === "folder"
                            ? "bg-[#FBBC04]/15 text-[#E37400]"
                            : "bg-[#1A73E8]/10 text-[#1A73E8]",
                        )}
                      >
                        <Icon className="h-4 w-4" strokeWidth={1.7} />
                      </div>
                    }
                  />
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </WorkspacePanelFrame>
  );
}
