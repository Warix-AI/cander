"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
  WorkspaceEmptyState,
  WorkspaceField,
  WorkspaceListRow,
  WorkspacePanelFrame,
  type WorkspaceToolbarState,
} from "@/components/connectors/views/WorkspaceViewChrome";
import { GDOCS_COMPOSIO_SLUGS } from "@/lib/connectors/google-workspace-composio";
import {
  peekViewCache,
  viewCacheKey,
  writeViewCache,
} from "@/lib/connectors/view-session-cache";

type Page = "documents" | "editor" | "create";

type StubDoc = {
  id: string;
  title: string;
  modified: string;
  preview?: string;
};

type DocsSessionCache = {
  status: string | null;
  page: Page;
  selected: StubDoc | null;
  title: string;
  markdown: string;
};

const DEMO_DOCS: StubDoc[] = [];

export function DocsConnectorView({
  onToolbarChange,
}: {
  onToolbarChange?: (state: WorkspaceToolbarState) => void;
}) {
  const { workspaceId } = useApp();
  const cacheKey = viewCacheKey("gdocs", workspaceId);
  const cached = peekViewCache<DocsSessionCache>(cacheKey);
  const [page, setPage] = useState<Page>(() => cached?.data.page ?? "documents");
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState<StubDoc | null>(
    () => cached?.data.selected ?? null,
  );
  const [status, setStatus] = useState<string | null>(
    () => cached?.data.status ?? null,
  );
  const [title, setTitle] = useState(() => cached?.data.title ?? "");
  const [markdown, setMarkdown] = useState(() => cached?.data.markdown ?? "");

  const persist = useCallback(
    (patch: Partial<DocsSessionCache>) => {
      const prev = peekViewCache<DocsSessionCache>(cacheKey)?.data;
      writeViewCache(cacheKey, {
        status: patch.status !== undefined ? patch.status : (prev?.status ?? status),
        page: patch.page ?? prev?.page ?? page,
        selected:
          patch.selected !== undefined ? patch.selected : (prev?.selected ?? selected),
        title: patch.title ?? prev?.title ?? title,
        markdown: patch.markdown ?? prev?.markdown ?? markdown,
      });
    },
    [cacheKey, markdown, page, selected, status, title],
  );

  const refresh = useCallback(
    (opts?: { force?: boolean }) => {
      if (!opts?.force && peekViewCache<DocsSessionCache>(cacheKey)?.fresh) {
        return;
      }
      setSyncing(true);
      setStatus(`Will search via ${GDOCS_COMPOSIO_SLUGS["gdocs.search"]}`);
      window.setTimeout(() => {
        const nextStatus = DEMO_DOCS.length
          ? null
          : "No documents yet — connect Docs to browse and open files.";
        setSyncing(false);
        setStatus(nextStatus);
        persist({ status: nextStatus, page: "documents" });
      }, 450);
    },
    [cacheKey, persist],
  );

  useEffect(() => {
    refresh({ force: false });
  }, [refresh]);

  useEffect(() => {
    persist({ page, selected, title, markdown, status });
  }, [markdown, page, persist, selected, status, title]);

  useEffect(() => {
    onToolbarChange?.({
      title:
        page === "create"
          ? "New document"
          : page === "editor"
            ? selected?.title ?? "Document"
            : "Documents",
      syncing,
      busy: false,
      canGoBack: page !== "documents",
      backLabel: "Documents",
      primaryLabel:
        page === "documents" ? "New" : page === "create" ? "Create" : null,
      onBack: () => {
        setPage("documents");
        setSelected(null);
      },
      onRefresh: () => refresh({ force: true }),
      onPrimary:
        page === "documents"
          ? () => setPage("create")
          : page === "create"
            ? () => {
                setStatus(
                  `Will create via ${GDOCS_COMPOSIO_SLUGS["gdocs.createMarkdown"]}`,
                );
                setPage("documents");
                setTitle("");
                setMarkdown("");
              }
            : null,
    });
  }, [page, syncing, onToolbarChange, selected, title, markdown, refresh]);

  return (
    <WorkspacePanelFrame status={status}>
      {page === "create" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <p className="text-[12px] font-medium text-muted-foreground">
            New Google Doc
          </p>
          <WorkspaceField
            label="Title"
            value={title}
            onChange={setTitle}
            placeholder="Project brief"
          />
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">
              Markdown
            </span>
            <textarea
              value={markdown}
              onChange={(event) => setMarkdown(event.target.value)}
              rows={10}
              placeholder="# Outline"
              className="mt-1 w-full resize-none rounded-[10px] border border-border bg-white px-3 py-2 text-[13px] outline-none dark:bg-space-canvas"
            />
          </label>
          <p className="text-[11px] text-muted-foreground">
            Create uses {GDOCS_COMPOSIO_SLUGS["gdocs.createMarkdown"]}. Updates
            use {GDOCS_COMPOSIO_SLUGS["gdocs.updateMarkdown"]}.
          </p>
        </div>
      ) : null}

      {page === "editor" && selected ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-black/5 px-4 py-3 dark:border-white/10">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em]">
              {selected.title}
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Opened via {GDOCS_COMPOSIO_SLUGS["gdocs.get"]} · {selected.modified}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-muted-foreground">
              {selected.preview ||
                "Document body will render here after Docs sync."}
            </p>
          </div>
        </div>
      ) : null}

      {page === "documents" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!DEMO_DOCS.length ? (
            <WorkspaceEmptyState
              title="No documents yet"
              body="Docs you can open and edit will list here."
              actionLabel="Search Docs"
              syncing={syncing}
              onAction={() => refresh({ force: true })}
            />
          ) : (
            DEMO_DOCS.map((doc) => (
              <WorkspaceListRow
                key={doc.id}
                title={doc.title}
                subtitle={doc.preview}
                meta={doc.modified}
                active={selected?.id === doc.id}
                onClick={() => {
                  setSelected(doc);
                  setPage("editor");
                }}
                leading={
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#4285F4]/12 text-[#4285F4]">
                    <FileText className="h-4 w-4" strokeWidth={1.7} />
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
