"use client";

import { useEffect, useState } from "react";
import { File, Folder } from "lucide-react";
import {
  WorkspaceEmptyState,
  WorkspaceField,
  WorkspaceListRow,
  WorkspacePanelFrame,
  type WorkspaceToolbarState,
} from "@/components/connectors/views/WorkspaceViewChrome";
import { GDRIVE_COMPOSIO_SLUGS } from "@/lib/connectors/google-workspace-composio";

type Page = "files" | "detail" | "create";

type StubFile = {
  id: string;
  name: string;
  kind: "file" | "folder";
  modified: string;
  owner?: string;
};

const DEMO_FILES: StubFile[] = [];

export function DriveConnectorView({
  onToolbarChange,
}: {
  onToolbarChange?: (state: WorkspaceToolbarState) => void;
}) {
  const [page, setPage] = useState<Page>("files");
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState<StubFile | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");

  const refresh = () => {
    setSyncing(true);
    setStatus(`Will search via ${GDRIVE_COMPOSIO_SLUGS["gdrive.find"]}`);
    window.setTimeout(() => {
      setSyncing(false);
      setStatus(
        DEMO_FILES.length
          ? null
          : "No files yet — connect Drive to browse folders and files.",
      );
    }, 450);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onToolbarChange?.({
      title:
        page === "create"
          ? "New file"
          : page === "detail"
            ? "File"
            : "My Drive",
      syncing,
      busy: false,
      canGoBack: page !== "files",
      backLabel: "My Drive",
      primaryLabel: page === "files" ? "New" : page === "create" ? "Create" : null,
      onBack: () => {
        setPage("files");
        setSelected(null);
      },
      onRefresh: refresh,
      onPrimary:
        page === "files"
          ? () => setPage("create")
          : page === "create"
            ? () => {
                setStatus(
                  `Will create via ${GDRIVE_COMPOSIO_SLUGS["gdrive.createFromText"]} / ${GDRIVE_COMPOSIO_SLUGS["gdrive.createFolder"]}`,
                );
                setPage("files");
                setName("");
                setContent("");
              }
            : null,
    });
  }, [page, syncing, onToolbarChange, name, content]);

  return (
    <WorkspacePanelFrame status={status}>
      {page === "create" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <p className="text-[12px] font-medium text-muted-foreground">
            New file from text
          </p>
          <WorkspaceField
            label="Name"
            value={name}
            onChange={setName}
            placeholder="notes.txt"
          />
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
          <p className="text-[11px] text-muted-foreground">
            Also supports folders ({GDRIVE_COMPOSIO_SLUGS["gdrive.createFolder"]})
            and uploads ({GDRIVE_COMPOSIO_SLUGS["gdrive.upload"]}).
          </p>
        </div>
      ) : null}

      {page === "detail" && selected ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">
            {selected.name}
          </h2>
          <p className="mt-2 text-[12px] text-muted-foreground">
            {selected.kind === "folder" ? "Folder" : "File"} · {selected.modified}
          </p>
          {selected.owner ? (
            <p className="mt-1 text-[12px] text-muted-foreground">
              Owned by {selected.owner}
            </p>
          ) : null}
          <p className="mt-4 text-[12px] text-muted-foreground">
            Download / export via {GDRIVE_COMPOSIO_SLUGS["gdrive.download"]}. Share
            via {GDRIVE_COMPOSIO_SLUGS["gdrive.share"]}.
          </p>
        </div>
      ) : null}

      {page === "files" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!DEMO_FILES.length ? (
            <WorkspaceEmptyState
              title="Drive is empty here"
              body="File list will appear after Drive search is connected."
              actionLabel="Search Drive"
              syncing={syncing}
              onAction={refresh}
            />
          ) : (
            DEMO_FILES.map((file) => (
              <WorkspaceListRow
                key={file.id}
                title={file.name}
                subtitle={file.owner}
                meta={file.modified}
                active={selected?.id === file.id}
                onClick={() => {
                  setSelected(file);
                  setPage("detail");
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
      ) : null}
    </WorkspacePanelFrame>
  );
}
