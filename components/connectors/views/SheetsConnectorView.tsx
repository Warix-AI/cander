"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { useApp } from "@/components/app/AppProvider";
import { ConnectorMobileSearchBar } from "@/components/connectors/ConnectorMobileSearchBar";
import { ConnectorLoadingState } from "@/components/connectors/views/ConnectorLoadingState";
import { MobileFloatingNav } from "@/components/shell/mobile/MobileFloatingNav";
import {
  WorkspaceEmptyState,
  WorkspaceField,
  WorkspaceListRow,
  WorkspacePanelFrame,
  type WorkspaceToolbarState,
} from "@/components/connectors/views/WorkspaceViewChrome";
import { runConnectorViewOperation } from "@/lib/api/connector-client";
import {
  connectorLabelForId,
  setConnectorBrowseFocus,
  setConnectorFocus,
} from "@/lib/connector-focus";
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
import { cn } from "@/lib/utils";

type Page = "browse" | "detail" | "create";

type SheetItem = {
  id: string;
  name: string;
  modified: string;
  modifiedAt: string | null;
  webViewLink?: string;
  embedUrl?: string;
  sheetNames?: string[];
  values?: string[][];
};

type SheetsSessionCache = {
  status: string | null;
  error: string | null;
  page: Page;
  sheets: SheetItem[];
  selected: SheetItem | null;
  newTitle: string;
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

function sheetUrls(id: string) {
  return {
    embedUrl: `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/preview`,
    webViewLink: `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`,
  };
}

function parseSheetItem(raw: unknown): SheetItem | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id =
    (typeof row.id === "string" && row.id) ||
    (typeof row.spreadsheetId === "string" && row.spreadsheetId) ||
    (typeof row.spreadsheet_id === "string" && row.spreadsheet_id) ||
    null;
  if (!id) return null;
  const name =
    (typeof row.name === "string" && row.name) ||
    (typeof row.title === "string" && row.title) ||
    "Untitled spreadsheet";
  const modifiedRaw =
    (typeof row.modifiedTime === "string" && row.modifiedTime) ||
    (typeof row.modified_time === "string" && row.modified_time) ||
    null;
  const urls = sheetUrls(id);
  const webViewLink =
    (typeof row.webViewLink === "string" && row.webViewLink) ||
    (typeof row.web_view_link === "string" && row.web_view_link) ||
    urls.webViewLink;
  return {
    id,
    name,
    modified: formatModified(modifiedRaw),
    modifiedAt: modifiedRaw,
    webViewLink,
    embedUrl: urls.embedUrl,
  };
}

function extractValueGrid(payload: Record<string, unknown>): string[][] {
  const valueRanges = Array.isArray(payload.valueRanges)
    ? payload.valueRanges
    : Array.isArray(payload.value_ranges)
      ? payload.value_ranges
      : null;
  if (valueRanges?.[0] && typeof valueRanges[0] === "object") {
    const values = (valueRanges[0] as Record<string, unknown>).values;
    if (Array.isArray(values)) {
      return values.map((row) =>
        Array.isArray(row)
          ? row.map((cell) => String(cell ?? ""))
          : [String(row ?? "")],
      );
    }
  }
  if (Array.isArray(payload.values)) {
    return payload.values.map((row) =>
      Array.isArray(row)
        ? row.map((cell) => String(cell ?? ""))
        : [String(row ?? "")],
    );
  }
  const data = payload.data;
  if (data && typeof data === "object") {
    return extractValueGrid(data as Record<string, unknown>);
  }
  return [];
}

export function SheetsConnectorView({
  onToolbarChange,
  onOpenLink,
}: {
  onToolbarChange?: (state: WorkspaceToolbarState) => void;
  onOpenLink?: (url: string) => void;
}) {
  const { workspaceId } = useApp();
  const cacheKey = viewCacheKey("gsheets", workspaceId);
  const connectionRevision = useSyncExternalStore(
    subscribeConnectorConnections,
    getConnectorConnectionsRevision,
    () => 0,
  );
  const cached = peekViewCache<SheetsSessionCache>(cacheKey);
  const [page, setPage] = useState<Page>(() => cached?.data.page ?? "browse");
  const [sheets, setSheets] = useState<SheetItem[]>(
    () => cached?.data.sheets ?? [],
  );
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selected, setSelected] = useState<SheetItem | null>(
    () => cached?.data.selected ?? null,
  );
  const [status, setStatus] = useState<string | null>(
    () => cached?.data.status ?? null,
  );
  const [error, setError] = useState<string | null>(
    () => cached?.data.error ?? null,
  );
  const [newTitle, setNewTitle] = useState(() => cached?.data.newTitle ?? "");
  const [query, setQuery] = useState(() => cached?.data.query ?? "");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    () => cached?.data.lastSyncedAt ?? null,
  );
  const [tabs, setTabs] = useState<string[]>(
    () => cached?.data.selected?.sheetNames ?? [],
  );
  const [activeTab, setActiveTab] = useState<string | null>(
    () => cached?.data.selected?.sheetNames?.[0] ?? null,
  );
  const [grid, setGrid] = useState<string[][]>(
    () => cached?.data.selected?.values ?? [],
  );

  const persist = useCallback(
    (patch: Partial<SheetsSessionCache>, opts?: { markFetched?: boolean }) => {
      const prev = peekViewCache<SheetsSessionCache>(cacheKey);
      const next = {
        status: patch.status !== undefined ? patch.status : (prev?.data.status ?? status),
        error: patch.error !== undefined ? patch.error : (prev?.data.error ?? error),
        page: patch.page ?? prev?.data.page ?? page,
        sheets: patch.sheets ?? prev?.data.sheets ?? sheets,
        selected:
          patch.selected !== undefined ? patch.selected : (prev?.data.selected ?? selected),
        newTitle: patch.newTitle ?? prev?.data.newTitle ?? newTitle,
        query: patch.query ?? prev?.data.query ?? query,
        lastSyncedAt:
          patch.lastSyncedAt !== undefined
            ? patch.lastSyncedAt
            : (prev?.data.lastSyncedAt ?? lastSyncedAt),
      };
      if (opts?.markFetched) writeViewCache(cacheKey, next);
      else patchViewCache(cacheKey, next);
    },
    [cacheKey, error, lastSyncedAt, newTitle, page, query, selected, sheets, status],
  );

  const refresh = useCallback(
    async (opts?: { force?: boolean; searchQuery?: string }) => {
      const needle = (opts?.searchQuery ?? query).trim();
      if (
        !opts?.force &&
        peekViewCache<SheetsSessionCache>(cacheKey)?.fresh &&
        peekViewCache<SheetsSessionCache>(cacheKey)?.data.lastSyncedAt &&
        !needle
      ) {
        return;
      }
      setSyncing(true);
      setError(null);
      try {
        const result = await runConnectorViewOperation({
          workspaceId,
          connectorId: "gsheets",
          operation: "searchSpreadsheets",
          input: {
            query: needle || undefined,
            maxResults: 40,
          },
        });
        const raw = Array.isArray(result.data.spreadsheets)
          ? result.data.spreadsheets
          : [];
        const parsed = raw
          .map(parseSheetItem)
          .filter((item): item is SheetItem => Boolean(item));
        setSheets(parsed);
        const syncedAt = new Date().toISOString();
        setLastSyncedAt(syncedAt);
        const nextStatus = parsed.length
          ? null
          : needle
            ? "No matching spreadsheets."
            : null;
        setStatus(nextStatus);
        persist(
          {
            sheets: parsed,
            status: nextStatus,
            error: null,
            page: "browse",
            query: needle,
            lastSyncedAt: syncedAt,
          },
          { markFetched: true },
        );
      } catch (err) {
        setSheets([]);
        setStatus(null);
        setError(
          err instanceof Error
            ? err.message
            : "Could not load Sheets. Connect Google Sheets and try again.",
        );
      } finally {
        setSyncing(false);
      }
    },
    [cacheKey, persist, query, workspaceId],
  );

  const openWorkbook = useCallback(
    async (sheet: SheetItem) => {
      const urls = sheetUrls(sheet.id);
      const next = {
        ...sheet,
        embedUrl: sheet.embedUrl || urls.embedUrl,
        webViewLink: sheet.webViewLink || urls.webViewLink,
        values: undefined,
      };
      setSelected(next);
      setError(null);
      setStatus(null);
      setTabs([]);
      setActiveTab(null);
      setGrid([]);
      setPreviewLoading(true);
      setPage("detail");
      setConnectorFocus({
        connectorId: "gsheets",
        connectorLabel: connectorLabelForId("gsheets"),
        itemId: next.id,
        itemTitle: next.name,
        itemKind: "sheet",
        openUrl: next.webViewLink,
      });
      persist({ selected: next, page: "detail", error: null });
      try {
        const namesResult = await runConnectorViewOperation({
          workspaceId,
          connectorId: "gsheets",
          operation: "getSheetNames",
          input: { spreadsheetId: sheet.id },
        });
        const sheetNames = Array.isArray(namesResult.data.sheetNames)
          ? namesResult.data.sheetNames.filter(
              (name): name is string => typeof name === "string" && Boolean(name),
            )
          : [];
        const first = sheetNames[0] ?? "Sheet1";
        const names = sheetNames.length ? sheetNames : [first];
        setTabs(names);
        setActiveTab(first);
        const valuesResult = await runConnectorViewOperation({
          workspaceId,
          connectorId: "gsheets",
          operation: "getValues",
          input: {
            spreadsheetId: sheet.id,
            range: `${first}!A1:Z100`,
          },
        });
        const nextGrid = extractValueGrid(valuesResult.data);
        setGrid(nextGrid);
        const loaded = {
          ...next,
          sheetNames: names,
          values: nextGrid,
        };
        setSelected(loaded);
        setConnectorFocus({
          connectorId: "gsheets",
          connectorLabel: connectorLabelForId("gsheets"),
          itemId: loaded.id,
          itemTitle: loaded.name,
          itemKind: "sheet",
          openUrl: loaded.webViewLink,
          sheetTab: first,
        });
        persist({ selected: loaded, page: "detail", error: null });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not load this spreadsheet.",
        );
      } finally {
        setPreviewLoading(false);
      }
    },
    [persist, workspaceId],
  );

  const loadSheetTab = useCallback(
    async (sheet: SheetItem, tab: string) => {
      setActiveTab(tab);
      setPreviewLoading(true);
      setError(null);
      try {
        const valuesResult = await runConnectorViewOperation({
          workspaceId,
          connectorId: "gsheets",
          operation: "getValues",
          input: {
            spreadsheetId: sheet.id,
            range: `${tab}!A1:Z100`,
          },
        });
        const nextGrid = extractValueGrid(valuesResult.data);
        setGrid(nextGrid);
        setSelected((prev) =>
          prev
            ? {
                ...prev,
                values: nextGrid,
                sheetNames: tabs.length ? tabs : prev.sheetNames,
              }
            : prev,
        );
        setConnectorFocus({
          connectorId: "gsheets",
          connectorLabel: connectorLabelForId("gsheets"),
          itemId: sheet.id,
          itemTitle: sheet.name,
          itemKind: "sheet",
          openUrl: sheet.webViewLink,
          sheetTab: tab,
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not load this sheet tab.",
        );
      } finally {
        setPreviewLoading(false);
      }
    },
    [tabs, workspaceId],
  );

  const createSpreadsheet = useCallback(async () => {
    const title = newTitle.trim() || "Untitled spreadsheet";
    setBusy(true);
    setError(null);
    try {
      const result = await runConnectorViewOperation({
        workspaceId,
        connectorId: "gsheets",
        operation: "createSpreadsheet",
        input: { title },
      });
      const created = parseSheetItem(result.data) ?? {
        id:
          (typeof result.data.spreadsheetId === "string" &&
            result.data.spreadsheetId) ||
          (typeof result.data.id === "string" && result.data.id) ||
          "",
        name: title,
        modified: "Just now",
        modifiedAt: new Date().toISOString(),
        ...sheetUrls(
          (typeof result.data.spreadsheetId === "string" &&
            result.data.spreadsheetId) ||
            (typeof result.data.id === "string" && result.data.id) ||
            "",
        ),
      };
      if (!created.id) {
        await refresh({ force: true });
        setPage("browse");
        setNewTitle("");
        return;
      }
      setNewTitle("");
      setSheets((prev) => [created, ...prev.filter((row) => row.id !== created.id)]);
      openWorkbook(created);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create spreadsheet.",
      );
    } finally {
      setBusy(false);
    }
  }, [newTitle, openWorkbook, refresh, workspaceId]);

  const openExternal = useCallback(() => {
    if (!selected?.webViewLink) return;
    if (onOpenLink) onOpenLink(selected.webViewLink);
    else window.open(selected.webViewLink, "_blank", "noopener,noreferrer");
  }, [onOpenLink, selected]);

  useEffect(() => {
    void refresh({ force: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount / workspace only
  }, [workspaceId]);

  useEffect(() => {
    if (page === "browse") {
      setConnectorBrowseFocus({
        connectorId: "gsheets",
        connectorLabel: connectorLabelForId("gsheets"),
      });
    }
  }, [page]);

  // Keep focus across Chat|Panel toggles (do not clear on unmount).

  // After OAuth activates, drop any failed first-open cache and reload.
  useEffect(() => {
    const connections = connectionsForConnectorLive(workspaceId, "gsheets");
    const active = connections.some((row) => row.status === "active");
    if (active && error) {
      invalidateViewCache(cacheKey);
      void refresh({ force: true });
    }
  }, [cacheKey, error, refresh, workspaceId, connectionRevision]);

  useEffect(() => {
    persist({
      page,
      sheets,
      selected,
      newTitle,
      query,
      status,
      error,
      lastSyncedAt,
    });
  }, [
    error,
    lastSyncedAt,
    newTitle,
    page,
    persist,
    query,
    selected,
    sheets,
    status,
  ]);

  useEffect(() => {
    const onBrowse = page === "browse";
    onToolbarChange?.({
      title:
        page === "create"
          ? "New spreadsheet"
          : page === "detail"
            ? selected?.name ?? "Spreadsheet"
            : "Sheets",
      syncing: syncing || busy || previewLoading,
      busy,
      canGoBack: page !== "browse",
      backLabel: "Sheets",
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
          ? "Sheets · Syncing…"
          : lastSyncedAt
            ? `Sheets · Last synced ${formatSyncWhen(lastSyncedAt)}`
            : "Sheets"
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
        if (query.trim()) {
          setQuery("");
          setMobileSearchOpen(false);
          void refresh({ force: true, searchQuery: "" });
        }
      },
      onRefresh: () => {
        if (page === "detail" && selected) {
          void openWorkbook(selected);
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
              ? () => void createSpreadsheet()
              : null,
    });
  }, [
    busy,
    createSpreadsheet,
    lastSyncedAt,
    onToolbarChange,
    openExternal,
    openWorkbook,
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
            value={newTitle}
            onChange={setNewTitle}
            placeholder="Q4 plan"
          />
          <p className="text-[12px] text-muted-foreground">
            Creates a new Google Spreadsheet in your Drive.
          </p>
        </div>
      ) : null}

      {page === "detail" && selected ? (
        <div className="relative flex min-h-0 flex-1 flex-col pb-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
          {/* Desktop: top tab strip. Mobile: floating bottom nav (Stripe-style). */}
          <div className="hidden shrink-0 overflow-x-auto border-b border-black/5 px-2 py-2 dark:border-white/10 lg:block">
            <div className="flex min-w-max gap-1">
              {(tabs.length ? tabs : ["Sheet1"]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    if (tab === activeTab) return;
                    void loadSheetTab(selected, tab);
                  }}
                  className={cn(
                    "h-7 shrink-0 rounded-full px-2.5 text-[11.5px] font-medium tracking-[-0.01em] transition-colors",
                    (activeTab ?? tabs[0] ?? "Sheet1") === tab
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <MobileFloatingNav
            activeId={activeTab ?? tabs[0] ?? "Sheet1"}
            label="Spreadsheet tabs"
          >
            {(tabs.length ? tabs : ["Sheet1"]).map((tab) => {
              const active = (activeTab ?? tabs[0] ?? "Sheet1") === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    if (active) return;
                    void loadSheetTab(selected, tab);
                  }}
                  className={cn(
                    "h-10 shrink-0 rounded-full px-4 text-[14px] font-medium transition-colors",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60",
                  )}
                >
                  {tab}
                </button>
              );
            })}
          </MobileFloatingNav>

          {previewLoading ? (
            <div className="mobile-header-content flex min-h-0 flex-1 flex-col">
              <ConnectorLoadingState
                connectorId="gsheets"
                label="Loading spreadsheet"
              />
            </div>
          ) : grid.length ? (
            <div className="mobile-header-content min-h-0 flex-1 overflow-auto overscroll-contain">
              <table className="min-w-full border-collapse text-left text-[12px]">
                <tbody>
                  {grid.map((row, rowIndex) => (
                    <tr
                      key={rowIndex}
                      className={cn(
                        "border-b border-border/60",
                        rowIndex === 0 && "bg-muted/50",
                      )}
                    >
                      {row.map((value, columnIndex) => (
                        <td
                          key={columnIndex}
                          className={cn(
                            "max-w-56 border-r border-border/60 px-2.5 py-1.5 align-top break-words",
                            rowIndex === 0 && "font-medium text-foreground",
                          )}
                        >
                          {value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mobile-header-content flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <ConnectorMark
                id="gsheets"
                size="md"
                className="!h-10 !w-10 !bg-transparent"
              />
              <p className="text-[13px] font-medium">No values in this range</p>
              <p className="max-w-sm text-[12px] text-muted-foreground">
                Use Open to view this spreadsheet in Google Sheets, or try another tab.
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
              placeholder="Search Sheets"
              value={query}
              onChange={setQuery}
              onSubmit={() => {
                void refresh({ force: true, searchQuery: query });
              }}
              onDismiss={() => setMobileSearchOpen(false)}
            />
            {!sheets.length ? (
              <WorkspaceEmptyState
                connectorId="gsheets"
                title={syncing ? "Loading Sheets…" : "Nothing here yet"}
                body={
                  error
                    ? "Connect Google Sheets in Connectors, then refresh."
                    : query.trim()
                      ? "No spreadsheets match this search."
                      : "Search or create a spreadsheet to get started."
                }
                actionLabel={syncing ? "Loading…" : "Refresh"}
                syncing={syncing}
                onAction={() => void refresh({ force: true })}
              />
            ) : (
              sheets.map((sheet) => (
                <WorkspaceListRow
                  key={sheet.id}
                  title={sheet.name}
                  subtitle="Google Sheet"
                  meta={sheet.modified}
                  active={selected?.id === sheet.id}
                  onClick={() => void openWorkbook(sheet)}
                  leading={
                    <span className="mt-0.5 shrink-0">
                      <ConnectorMark
                        id="gsheets"
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
