"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Loader2 } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { useApp } from "@/components/app/AppProvider";
import { ConnectorMobileSearchBar } from "@/components/connectors/ConnectorMobileSearchBar";
import {
  WorkspaceEmptyState,
  WorkspaceField,
  WorkspaceListRow,
  WorkspacePanelFrame,
  type WorkspaceToolbarState,
} from "@/components/connectors/views/WorkspaceViewChrome";
import { runConnectorViewOperation } from "@/lib/api/connector-client";
import {
  connectionsForConnectorLive,
  getConnectorConnectionsRevision,
  subscribeConnectorConnections,
} from "@/lib/connector-connections-store";
import {
  invalidateViewCache,
  patchViewCache,
  peekViewCache,
  viewCacheKey,
  writeViewCache,
} from "@/lib/connectors/view-session-cache";

type Page = "browse" | "detail" | "create";

type DocItem = {
  id: string;
  title: string;
  modified: string;
  modifiedAt: string | null;
  embedUrl?: string;
  openUrl?: string;
  bodyText?: string | null;
};

type DocsSessionCache = {
  status: string | null;
  error: string | null;
  page: Page;
  documents: DocItem[];
  selected: DocItem | null;
  title: string;
  markdown: string;
  query: string;
  lastSyncedAt: string | null;
};

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

function formatSyncWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function docUrls(id: string) {
  return {
    embedUrl: `https://docs.google.com/document/d/${encodeURIComponent(id)}/preview`,
    openUrl: `https://docs.google.com/document/d/${encodeURIComponent(id)}/edit`,
  };
}

function parseDocItem(raw: unknown): DocItem | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id =
    (typeof row.id === "string" && row.id) ||
    (typeof row.documentId === "string" && row.documentId) ||
    (typeof row.document_id === "string" && row.document_id) ||
    null;
  if (!id) return null;
  const title =
    (typeof row.title === "string" && row.title) ||
    (typeof row.name === "string" && row.name) ||
    "Untitled document";
  const modifiedRaw =
    (typeof row.modifiedTime === "string" && row.modifiedTime) ||
    (typeof row.modified_time === "string" && row.modified_time) ||
    null;
  const urls = docUrls(id);
  return {
    id,
    title,
    modified: formatModified(modifiedRaw),
    modifiedAt: modifiedRaw,
    embedUrl: urls.embedUrl,
    openUrl: urls.openUrl,
  };
}

export function DocsConnectorView({
  onToolbarChange,
  onOpenLink,
}: {
  onToolbarChange?: (state: WorkspaceToolbarState) => void;
  onOpenLink?: (url: string) => void;
}) {
  const { workspaceId } = useApp();
  const cacheKey = viewCacheKey("gdocs", workspaceId);
  const connectionRevision = useSyncExternalStore(
    subscribeConnectorConnections,
    getConnectorConnectionsRevision,
    () => 0,
  );
  const cached = peekViewCache<DocsSessionCache>(cacheKey);
  const [page, setPage] = useState<Page>(() => cached?.data.page ?? "browse");
  const [documents, setDocuments] = useState<DocItem[]>(
    () => cached?.data.documents ?? [],
  );
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selected, setSelected] = useState<DocItem | null>(
    () => cached?.data.selected ?? null,
  );
  const [status, setStatus] = useState<string | null>(
    () => cached?.data.status ?? null,
  );
  const [error, setError] = useState<string | null>(
    () => cached?.data.error ?? null,
  );
  const [title, setTitle] = useState(() => cached?.data.title ?? "");
  const [markdown, setMarkdown] = useState(() => cached?.data.markdown ?? "");
  const [query, setQuery] = useState(() => cached?.data.query ?? "");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    () => cached?.data.lastSyncedAt ?? null,
  );

  const persist = useCallback(
    (patch: Partial<DocsSessionCache>, opts?: { markFetched?: boolean }) => {
      const prev = peekViewCache<DocsSessionCache>(cacheKey);
      const next = {
        status: patch.status !== undefined ? patch.status : (prev?.data.status ?? status),
        error: patch.error !== undefined ? patch.error : (prev?.data.error ?? error),
        page: patch.page ?? prev?.data.page ?? page,
        documents: patch.documents ?? prev?.data.documents ?? documents,
        selected:
          patch.selected !== undefined ? patch.selected : (prev?.data.selected ?? selected),
        title: patch.title ?? prev?.data.title ?? title,
        markdown: patch.markdown ?? prev?.data.markdown ?? markdown,
        query: patch.query ?? prev?.data.query ?? query,
        lastSyncedAt:
          patch.lastSyncedAt !== undefined
            ? patch.lastSyncedAt
            : (prev?.data.lastSyncedAt ?? lastSyncedAt),
      };
      if (opts?.markFetched) writeViewCache(cacheKey, next);
      else patchViewCache(cacheKey, next);
    },
    [cacheKey, documents, error, lastSyncedAt, markdown, page, query, selected, status, title],
  );

  const refresh = useCallback(
    async (opts?: { force?: boolean; searchQuery?: string }) => {
      const needle = (opts?.searchQuery ?? query).trim();
      if (
        !opts?.force &&
        peekViewCache<DocsSessionCache>(cacheKey)?.fresh &&
        peekViewCache<DocsSessionCache>(cacheKey)?.data.lastSyncedAt &&
        !needle
      ) {
        return;
      }
      setSyncing(true);
      setError(null);
      try {
        const result = await runConnectorViewOperation({
          workspaceId,
          connectorId: "gdocs",
          operation: "searchDocuments",
          input: {
            query: needle || undefined,
            maxResults: 40,
          },
        });
        const raw = Array.isArray(result.data.documents)
          ? result.data.documents
          : [];
        const parsed = raw
          .map(parseDocItem)
          .filter((item): item is DocItem => Boolean(item));
        setDocuments(parsed);
        const syncedAt = new Date().toISOString();
        setLastSyncedAt(syncedAt);
        const nextStatus = parsed.length
          ? null
          : needle
            ? "No matching documents."
            : null;
        setStatus(nextStatus);
        persist(
          {
            documents: parsed,
            status: nextStatus,
            error: null,
            page: "browse",
            query: needle,
            lastSyncedAt: syncedAt,
          },
          { markFetched: true },
        );
      } catch (err) {
        setDocuments([]);
        setStatus(null);
        setError(
          err instanceof Error
            ? err.message
            : "Could not load Docs. Connect Google Docs and try again.",
        );
      } finally {
        setSyncing(false);
      }
    },
    [cacheKey, persist, query, workspaceId],
  );

  const openDocument = useCallback(
    async (doc: DocItem) => {
      const urls = docUrls(doc.id);
      const next = {
        ...doc,
        embedUrl: doc.embedUrl || urls.embedUrl,
        openUrl: doc.openUrl || urls.openUrl,
      };
      setSelected(next);
      setPage("detail");
      setError(null);
      setStatus(null);
      setPreviewLoading(true);
      persist({ selected: next, page: "detail", error: null });
      try {
        const result = await runConnectorViewOperation({
          workspaceId,
          connectorId: "gdocs",
          operation: "getDocument",
          input: { documentId: doc.id },
        });
        const loaded = {
          ...next,
          title: typeof result.data.title === "string" ? result.data.title : next.title,
          bodyText: typeof result.data.bodyText === "string" ? result.data.bodyText : null,
        };
        setSelected(loaded);
        persist({ selected: loaded, page: "detail", error: null });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load this document.");
      } finally {
        setPreviewLoading(false);
      }
    },
    [persist, workspaceId],
  );

  const createDocument = useCallback(async () => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError("Add a title before creating.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await runConnectorViewOperation({
        workspaceId,
        connectorId: "gdocs",
        operation: "createDocument",
        input: { title: nextTitle, markdown },
      });
      const created = parseDocItem(result.data) ?? {
        id:
          (typeof result.data.id === "string" && result.data.id) ||
          (typeof result.data.documentId === "string" &&
            result.data.documentId) ||
          "",
        title: nextTitle,
        modified: "Just now",
        modifiedAt: new Date().toISOString(),
        ...docUrls(
          (typeof result.data.id === "string" && result.data.id) ||
            (typeof result.data.documentId === "string" &&
              result.data.documentId) ||
            "",
        ),
      };
      setTitle("");
      setMarkdown("");
      if (!created.id) {
        await refresh({ force: true });
        setPage("browse");
        return;
      }
      setDocuments((prev) => [
        created,
        ...prev.filter((row) => row.id !== created.id),
      ]);
      openDocument(created);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create document.",
      );
    } finally {
      setBusy(false);
    }
  }, [markdown, openDocument, refresh, title, workspaceId]);

  const openExternal = useCallback(() => {
    const url = selected?.openUrl;
    if (!url) return;
    if (onOpenLink) onOpenLink(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  }, [onOpenLink, selected]);

  useEffect(() => {
    void refresh({ force: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount / workspace only
  }, [workspaceId]);

  useEffect(() => {
    const connections = connectionsForConnectorLive(workspaceId, "gdocs");
    const active = connections.some((row) => row.status === "active");
    if (active && error) {
      invalidateViewCache(cacheKey);
      void refresh({ force: true });
    }
  }, [cacheKey, error, refresh, workspaceId, connectionRevision]);

  useEffect(() => {
    persist({
      page,
      documents,
      selected,
      title,
      markdown,
      query,
      status,
      error,
      lastSyncedAt,
    });
  }, [
    documents,
    error,
    lastSyncedAt,
    markdown,
    page,
    persist,
    query,
    selected,
    status,
    title,
  ]);

  useEffect(() => {
    const onBrowse = page === "browse";
    onToolbarChange?.({
      title:
        page === "create"
          ? "New document"
          : page === "detail"
            ? selected?.title ?? "Document"
            : "Documents",
      syncing: syncing || busy || previewLoading,
      busy,
      canGoBack: page !== "browse",
      backLabel: "Documents",
      primaryLabel:
        page === "detail"
          ? "Open"
          : page === "browse"
            ? "New"
            : page === "create"
              ? "Create"
              : null,
      syncHint: onBrowse
        ? syncing && !lastSyncedAt
          ? "Documents · Syncing…"
          : lastSyncedAt
            ? `Documents · Last synced ${formatSyncWhen(lastSyncedAt)}`
            : "Documents"
        : null,
      driveChrome: onBrowse
        ? {
            query,
            onQueryChange: setQuery,
            onSearch: () => {
              void refresh({ force: true, searchQuery: query });
            },
            onOpenMobileSearch: () => setMobileSearchOpen(true),
            typeFilter: "all",
            sortMode: "modified-desc",
            onTypeFilter: () => undefined,
            onSortMode: () => undefined,
          }
        : null,
      onBack: () => {
        setPage("browse");
        setSelected(null);
        setPreviewLoading(false);
      },
      onRefresh: () => {
        if (page === "detail" && selected) {
          void openDocument(selected);
          return;
        }
        void refresh({ force: true });
      },
      onPrimary:
        page === "detail"
          ? () => openExternal()
          : page === "browse"
            ? () => setPage("create")
            : page === "create"
              ? () => void createDocument()
              : null,
    });
  }, [
    busy,
    createDocument,
    lastSyncedAt,
    onToolbarChange,
    openDocument,
    openExternal,
    page,
    previewLoading,
    query,
    refresh,
    selected,
    syncing,
  ]);

  return (
    <WorkspacePanelFrame status={status} error={error}>
      {page === "create" ? (
        <div className="mobile-header-content flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4">
          <WorkspaceField
            label="Name"
            value={title}
            onChange={setTitle}
            placeholder="Project brief"
          />
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">
              Content (Markdown)
            </span>
            <textarea
              value={markdown}
              onChange={(event) => setMarkdown(event.target.value)}
              rows={10}
              placeholder="# Outline"
              className="mt-1 w-full resize-none rounded-[10px] border border-border bg-white px-3 py-2 text-[13px] outline-none dark:bg-space-canvas"
            />
          </label>
        </div>
      ) : null}

      {page === "detail" && selected ? (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {previewLoading ? (
            <div className="pointer-events-none absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur-sm">
              <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.7} />
              Loading…
            </div>
          ) : null}
          {selected.bodyText ? (
            <div className="mobile-header-content min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              <pre className="whitespace-pre-wrap break-words font-sans text-[14px] leading-relaxed text-foreground/90">
                {selected.bodyText}
              </pre>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <ConnectorMark
                id="gdocs"
                size="md"
                className="!h-10 !w-10 !bg-transparent"
              />
              <p className="text-[13px] font-medium">Document content is unavailable</p>
              <p className="max-w-sm text-[12px] text-muted-foreground">
                This document is being read through the connected Google Docs account.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {page === "browse" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mobile-header-content min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <ConnectorMobileSearchBar
              open={mobileSearchOpen}
              placeholder="Search Docs"
              value={query}
              onChange={setQuery}
              onSubmit={() => {
                void refresh({ force: true, searchQuery: query });
              }}
              onDismiss={() => setMobileSearchOpen(false)}
            />
            {!documents.length ? (
              <WorkspaceEmptyState
                title={syncing ? "Loading Docs…" : "Nothing here yet"}
                body={
                  error
                    ? "Connect Google Docs in Connectors, then refresh."
                    : query.trim()
                      ? "No documents match this search."
                      : "Search or create a document to get started."
                }
                actionLabel={syncing ? "Loading…" : "Refresh"}
                syncing={syncing}
                onAction={() => void refresh({ force: true })}
              />
            ) : (
              documents.map((doc) => (
                <WorkspaceListRow
                  key={doc.id}
                  title={doc.title}
                  subtitle="Google Doc"
                  meta={doc.modified}
                  active={selected?.id === doc.id}
                  onClick={() => void openDocument(doc)}
                  leading={
                    <span className="mt-0.5 shrink-0">
                      <ConnectorMark
                        id="gdocs"
                        size="sm"
                        className="!h-8 !w-8 !bg-transparent"
                      />
                    </span>
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
