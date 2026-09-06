"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Loader2 } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { useApp } from "@/components/app/AppProvider";
import {
  WorkspaceEmptyState,
  WorkspaceListRow,
  WorkspacePanelFrame,
  type WorkspaceToolbarState,
} from "@/components/connectors/views/WorkspaceViewChrome";
import { runConnectorViewOperation } from "@/lib/api/connector-client";
import {
  connectionsForConnectorLive,
  getConnectorConnectionsRevision,
  getConnectorConnectionsSnapshot,
  getConnectorConnectionsServerSnapshot,
  subscribeConnectorConnections,
} from "@/lib/connector-connections-store";
import {
  invalidateViewCache,
  peekViewCache,
  viewCacheKey,
  writeViewCache,
} from "@/lib/connectors/view-session-cache";
import {
  appConnectorById,
  type AppListItem,
} from "@/lib/connectors/apps/definitions";

type Page = "browse" | "detail";

type AppSessionCache = {
  status: string | null;
  error: string | null;
  page: Page;
  items: AppListItem[];
  selected: AppListItem | null;
  detail: Record<string, unknown> | null;
  query: string;
  lastSyncedAt: string | null;
};

function formatSyncWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function detailPreview(detail: Record<string, unknown> | null) {
  if (!detail) return null;
  try {
    return JSON.stringify(detail, null, 2);
  } catch {
    return null;
  }
}

function filterItemsClientSide(items: AppListItem[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) => {
    const hay = `${item.title} ${item.subtitle ?? ""} ${item.meta ?? ""}`.toLowerCase();
    return hay.includes(needle);
  });
}

function isNotConnectedError(message: string) {
  return /not connected|no active connection|connect .+ and try|authorization/i.test(
    message,
  );
}

export function AppConnectorView({
  connectorId,
  onToolbarChange,
  onOpenLink,
}: {
  connectorId: string;
  onToolbarChange?: (state: WorkspaceToolbarState) => void;
  onOpenLink?: (url: string) => void;
}) {
  const def = appConnectorById(connectorId);
  const { workspaceId } = useApp();
  const cacheKey = viewCacheKey(connectorId, workspaceId);
  const cached = peekViewCache<AppSessionCache>(cacheKey);
  const connectionRevision = useSyncExternalStore(
    subscribeConnectorConnections,
    getConnectorConnectionsRevision,
    () => 0,
  );
  void getConnectorConnectionsSnapshot;
  void getConnectorConnectionsServerSnapshot;

  const isConnected = connectionsForConnectorLive(workspaceId, connectorId).some(
    (row) => row.status === "active",
  );
  const wasConnectedRef = useRef(isConnected);

  const [page, setPage] = useState<Page>(() => cached?.data.page ?? "browse");
  const [items, setItems] = useState<AppListItem[]>(
    () => cached?.data.items ?? [],
  );
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<AppListItem | null>(
    () => cached?.data.selected ?? null,
  );
  const [detail, setDetail] = useState<Record<string, unknown> | null>(
    () => cached?.data.detail ?? null,
  );
  const [status, setStatus] = useState<string | null>(
    () => cached?.data.status ?? null,
  );
  const [error, setError] = useState<string | null>(
    () => cached?.data.error ?? null,
  );
  const [query, setQuery] = useState(() => cached?.data.query ?? "");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    () => cached?.data.lastSyncedAt ?? null,
  );
  const retryTimerRef = useRef<number | null>(null);

  const name = def?.name ?? connectorId;
  const itemNoun = def?.itemNoun ?? "items";
  const searchPlaceholder = def?.searchPlaceholder ?? `Search ${name}`;
  const oauthPending = def?.oauthReady === false;

  const persist = useCallback(
    (patch: Partial<AppSessionCache>) => {
      const prev = peekViewCache<AppSessionCache>(cacheKey)?.data;
      writeViewCache(cacheKey, {
        status: patch.status !== undefined ? patch.status : (prev?.status ?? status),
        error: patch.error !== undefined ? patch.error : (prev?.error ?? error),
        page: patch.page ?? prev?.page ?? page,
        items: patch.items ?? prev?.items ?? items,
        selected:
          patch.selected !== undefined ? patch.selected : (prev?.selected ?? selected),
        detail: patch.detail !== undefined ? patch.detail : (prev?.detail ?? detail),
        query: patch.query ?? prev?.query ?? query,
        lastSyncedAt:
          patch.lastSyncedAt !== undefined
            ? patch.lastSyncedAt
            : (prev?.lastSyncedAt ?? lastSyncedAt),
      });
    },
    [cacheKey, detail, error, items, lastSyncedAt, page, query, selected, status],
  );

  const refresh = useCallback(
    async (opts?: { force?: boolean; searchQuery?: string; attempt?: number }) => {
      if (!def) return;
      if (oauthPending && !isConnected) {
        setItems([]);
        setStatus(null);
        setError(
          `${name} needs a custom Composio OAuth app before Connect works. Catalog is ready.`,
        );
        return;
      }

      const needle = (opts?.searchQuery ?? query).trim();
      if (
        !opts?.force &&
        !error &&
        peekViewCache<AppSessionCache>(cacheKey)?.fresh &&
        items.length > 0 &&
        !needle
      ) {
        return;
      }

      setSyncing(true);
      setError(null);
      try {
        const result = await runConnectorViewOperation({
          workspaceId,
          connectorId,
          operation: "listItems",
          input: {
            // Only send query to the API when the provider can search,
            // otherwise we fetch the full list and filter client-side.
            query:
              needle && (def.searchProvider || def.searchArg || def.mapSearchQuery)
                ? needle
                : def.clientSearch
                  ? undefined
                  : needle || undefined,
          },
        });
        let parsed = (Array.isArray(result.data.items) ? result.data.items : []).filter(
          (row): row is AppListItem =>
            Boolean(row && typeof row === "object" && typeof row.id === "string"),
        );
        if (def.clientSearch && needle) {
          parsed = filterItemsClientSide(parsed, needle);
        }
        setItems(parsed);
        const syncedAt = new Date().toISOString();
        setLastSyncedAt(syncedAt);
        const nextStatus = parsed.length
          ? null
          : needle
            ? `No matching ${itemNoun}.`
            : null;
        setStatus(nextStatus);
        persist({
          items: parsed,
          status: nextStatus,
          error: null,
          page: "browse",
          query: needle,
          lastSyncedAt: syncedAt,
        });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : `Could not load ${name}. Connect ${name} and try again.`;
        setItems([]);
        setStatus(null);
        setError(message);
        // Don't keep a "fresh" success cache after failure — force next open to retry.
        invalidateViewCache(cacheKey);

        const attempt = opts?.attempt ?? 0;
        if (attempt < 2 && isNotConnectedError(message)) {
          if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
          retryTimerRef.current = window.setTimeout(() => {
            void refresh({ force: true, searchQuery: needle, attempt: attempt + 1 });
          }, 1200 * (attempt + 1));
        }
      } finally {
        setSyncing(false);
      }
    },
    [
      cacheKey,
      connectorId,
      def,
      error,
      isConnected,
      itemNoun,
      items.length,
      name,
      oauthPending,
      persist,
      query,
      workspaceId,
    ],
  );

  const openItem = useCallback(
    async (item: AppListItem) => {
      setSelected(item);
      setPage("detail");
      setError(null);
      setStatus(null);
      setDetail(null);
      persist({ selected: item, page: "detail", error: null, detail: null });

      if (!def?.getProvider) {
        return;
      }

      setBusy(true);
      try {
        const result = await runConnectorViewOperation({
          workspaceId,
          connectorId,
          operation: "getItem",
          input: { id: item.id },
        });
        const nextDetail =
          result.data && typeof result.data === "object"
            ? (result.data as Record<string, unknown>)
            : null;
        setDetail(nextDetail);
        persist({ detail: nextDetail });
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : `Could not open this ${itemNoun.replace(/s$/, "") || "item"}.`,
        );
      } finally {
        setBusy(false);
      }
    },
    [connectorId, def?.getProvider, itemNoun, persist, workspaceId],
  );

  const openExternal = useCallback(() => {
    const url = selected?.openUrl;
    if (!url) return;
    if (onOpenLink) onOpenLink(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  }, [onOpenLink, selected]);

  useEffect(() => {
    void refresh({ force: Boolean(isConnected) });
    return () => {
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount / connector / workspace
  }, [workspaceId, connectorId]);

  // After OAuth completes, connection flips pending → active. Force a fresh pull
  // so the panel doesn't keep a failed first-open cache (Sheets/Docs issue).
  useEffect(() => {
    const was = wasConnectedRef.current;
    wasConnectedRef.current = isConnected;
    if (!was && isConnected) {
      invalidateViewCache(cacheKey);
      void refresh({ force: true });
    }
    // connectionRevision ensures we notice store patches after OAuth return.
    void connectionRevision;
  }, [cacheKey, connectionRevision, isConnected, refresh]);

  useEffect(() => {
    persist({
      page,
      items,
      selected,
      detail,
      query,
      status,
      error,
      lastSyncedAt,
    });
  }, [detail, error, items, lastSyncedAt, page, persist, query, selected, status]);

  useEffect(() => {
    const onBrowse = page === "browse";
    onToolbarChange?.({
      title: page === "detail" ? selected?.title ?? name : name,
      syncing: syncing || busy,
      busy,
      canGoBack: page !== "browse",
      backLabel: name,
      primaryLabel: page === "detail" && selected?.openUrl ? "Open" : null,
      syncHint: onBrowse
        ? syncing && !lastSyncedAt
          ? `${name} · Syncing…`
          : lastSyncedAt
            ? `${name} · Last synced ${formatSyncWhen(lastSyncedAt)}`
            : name
        : null,
      driveChrome: onBrowse
        ? {
            query,
            onQueryChange: setQuery,
            onSearch: () => {
              void refresh({ force: true, searchQuery: query });
            },
            typeFilter: "all",
            sortMode: "modified-desc",
            onTypeFilter: () => undefined,
            onSortMode: () => undefined,
          }
        : null,
      onBack: () => {
        setPage("browse");
        setSelected(null);
        setDetail(null);
        persist({ page: "browse", selected: null, detail: null });
      },
      onRefresh: () => {
        void refresh({ force: true });
      },
      onPrimary:
        page === "detail" && selected?.openUrl ? () => openExternal() : null,
    });
  }, [
    busy,
    lastSyncedAt,
    name,
    onToolbarChange,
    openExternal,
    page,
    persist,
    query,
    refresh,
    selected,
    syncing,
  ]);

  // Keep placeholder text in browser chrome via search — ConnectorBrowserPanel
  // already reads app name; searchPlaceholder is used in empty-state copy below.
  void searchPlaceholder;

  if (!def) {
    return (
      <WorkspacePanelFrame error={`Unknown connector: ${connectorId}`}>
        <div />
      </WorkspacePanelFrame>
    );
  }

  const preview = detailPreview(detail);

  return (
    <WorkspacePanelFrame status={status} error={error}>
      {page === "detail" && selected ? (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {busy ? (
            <div className="pointer-events-none absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur-sm">
              <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.7} />
              Loading…
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="mb-4 flex items-start gap-3">
              <ConnectorMark
                id={connectorId}
                size="md"
                className="!h-10 !w-10 shrink-0 !bg-transparent"
              />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[15px] font-medium tracking-tight">
                  {selected.title}
                </h2>
                {selected.subtitle ? (
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                    {selected.subtitle}
                  </p>
                ) : null}
                {selected.meta ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {selected.meta}
                  </p>
                ) : null}
              </div>
            </div>
            {preview ? (
              <pre className="overflow-x-auto rounded-[10px] border border-black/5 bg-black/[0.02] p-3 text-[11px] leading-relaxed text-foreground/90 dark:border-white/10 dark:bg-white/[0.03]">
                {preview}
              </pre>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                {def.getProvider
                  ? "Select refresh if details did not load."
                  : selected.openUrl
                    ? "Use Open in the bottom bar to view this in the provider."
                    : `No extra detail for this ${itemNoun.replace(/s$/, "") || "item"}.`}
              </p>
            )}
          </div>
        </div>
      ) : null}

      {page === "browse" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!items.length ? (
              <WorkspaceEmptyState
                title={
                  oauthPending && !isConnected
                    ? `${name} coming soon`
                    : syncing
                      ? `Loading ${itemNoun}…`
                      : `No ${itemNoun} yet`
                }
                body={
                  oauthPending && !isConnected
                    ? "Connect will unlock once Cander registers a Shopify OAuth app with Composio."
                    : syncing
                      ? `Fetching from ${name}.`
                      : isConnected
                        ? query.trim()
                          ? `No ${itemNoun} match “${query.trim()}”.`
                          : `Connected — refresh to load ${itemNoun}.`
                        : `Connect ${name} in Connectors, then open this panel again.`
                }
                actionLabel="Refresh"
                syncing={syncing}
                onAction={() => {
                  void refresh({ force: true });
                }}
              />
            ) : (
              <div className="divide-y divide-black/5 dark:divide-white/10">
                {items.map((item) => (
                  <WorkspaceListRow
                    key={item.id}
                    title={item.title}
                    subtitle={item.subtitle}
                    meta={item.meta}
                    onClick={() => {
                      void openItem(item);
                    }}
                    leading={
                      <ConnectorMark
                        id={connectorId}
                        size="sm"
                        className="!h-7 !w-7 !bg-transparent"
                      />
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </WorkspacePanelFrame>
  );
}
