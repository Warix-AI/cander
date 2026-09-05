"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, File, Folder } from "lucide-react";
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

type Page = "files" | "detail" | "create";

type DriveFile = {
  id: string;
  name: string;
  kind: "file" | "folder";
  mimeType: string;
  modified: string;
  owner?: string;
  webViewLink?: string;
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
    webViewLink:
      (typeof row.webViewLink === "string" && row.webViewLink) ||
      (typeof row.web_view_link === "string" && row.web_view_link) ||
      undefined,
  };
}

export function DriveConnectorView({
  onToolbarChange,
}: {
  onToolbarChange?: (state: WorkspaceToolbarState) => void;
}) {
  const { workspaceId } = useApp();
  const [page, setPage] = useState<Page>("files");
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<DriveFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [createMode, setCreateMode] = useState<"file" | "folder">("file");

  const loadFiles = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const result = await runConnectorViewOperation({
        workspaceId,
        connectorId: "gdrive",
        operation: "findFiles",
        input: {
          query: query.trim() || undefined,
          maxResults: 50,
        },
      });
      const rawFiles = Array.isArray(result.data.files) ? result.data.files : [];
      const parsed = rawFiles
        .map(parseDriveFile)
        .filter((file): file is DriveFile => Boolean(file));
      setFiles(parsed);
      setStatus(parsed.length ? null : "No matching files in Drive.");
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
  }, [query, workspaceId]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

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
          input: { name: name.trim() },
        });
        setStatus("Folder created");
      } else {
        await runConnectorViewOperation({
          workspaceId,
          connectorId: "gdrive",
          operation: "createFromText",
          input: { name: name.trim(), content: content.trim() },
        });
        setStatus("File created");
      }
      setName("");
      setContent("");
      setPage("files");
      await loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create item.");
    } finally {
      setBusy(false);
    }
  }, [content, createMode, loadFiles, name, workspaceId]);

  useEffect(() => {
    onToolbarChange?.({
      title:
        page === "create"
          ? createMode === "folder"
            ? "New folder"
            : "New file"
          : page === "detail"
            ? "File"
            : "My Drive",
      syncing,
      busy,
      canGoBack: page !== "files",
      backLabel: "My Drive",
      primaryLabel:
        page === "files" ? "New" : page === "create" ? "Create" : null,
      onBack: () => {
        setPage("files");
        setSelected(null);
        setError(null);
      },
      onRefresh: () => {
        void loadFiles();
      },
      onPrimary:
        page === "files"
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
    loadFiles,
    onToolbarChange,
    page,
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
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">
            {selected.name}
          </h2>
          <p className="mt-2 text-[12px] text-muted-foreground">
            {selected.kind === "folder" ? "Folder" : "File"}
            {selected.modified ? ` · ${selected.modified}` : ""}
          </p>
          {selected.owner ? (
            <p className="mt-1 text-[12px] text-muted-foreground">
              Owned by {selected.owner}
            </p>
          ) : null}
          <p className="mt-1 text-[11px] text-muted-foreground">{selected.mimeType}</p>
          {selected.webViewLink ? (
            <a
              href={selected.webViewLink}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "mt-4 inline-flex h-8 items-center gap-1.5 border border-border px-3 text-[12px] font-medium hover:bg-muted",
                SHELL_G3_RADIUS,
              )}
            >
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.6} />
              Open in Drive
            </a>
          ) : null}
        </div>
      ) : null}

      {page === "files" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-black/5 px-3 py-2 dark:border-white/10">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void loadFiles();
              }}
              placeholder="Search Drive…"
              className={cn(
                "h-8 w-full border border-border bg-transparent px-3 text-[13px] outline-none",
                SHELL_G3_RADIUS,
              )}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!files.length ? (
              <WorkspaceEmptyState
                title={syncing ? "Loading Drive…" : "No files yet"}
                body={
                  error
                    ? "Connect Google Drive in Connectors, then refresh."
                    : "Search or create a file to get started."
                }
                actionLabel={syncing ? "Loading…" : "Refresh"}
                syncing={syncing}
                onAction={() => void loadFiles()}
              />
            ) : (
              files.map((file) => (
                <WorkspaceListRow
                  key={file.id}
                  title={file.name}
                  subtitle={file.owner}
                  meta={file.modified}
                  active={selected?.id === file.id}
                  onClick={() => {
                    setSelected(file);
                    setPage("detail");
                    setError(null);
                    setStatus(null);
                  }}
                  leading={
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-muted text-muted-foreground">
                      {file.kind === "folder" ? (
                        <Folder className="h-4 w-4" strokeWidth={1.7} />
                      ) : (
                        <File className="h-4 w-4" strokeWidth={1.7} />
                      )}
                    </div>
                  }
                />
              ))
            )}
          </div>
        </div>
      ) : null}
    </WorkspacePanelFrame>
  );
}
