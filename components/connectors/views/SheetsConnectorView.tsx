"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { useApp } from "@/components/app/AppProvider";
import {
  WorkspaceEmptyState,
  WorkspaceField,
  WorkspaceListRow,
  WorkspacePanelFrame,
  type WorkspaceToolbarState,
} from "@/components/connectors/views/WorkspaceViewChrome";
import { runConnectorViewOperation } from "@/lib/api/connector-client";
import {
  peekViewCache,
  viewCacheKey,
  writeViewCache,
} from "@/lib/connectors/view-session-cache";

type Page = "browse" | "detail" | "range" | "create";

type SheetItem = {
  id: string;
  name: string;
  modified: string;
  modifiedAt: string | null;
  webViewLink?: string;
};

type SheetsSessionCache = {
  status: string | null;
  error: string | null;
  page: Page;
  sheets: SheetItem[];
  selected: SheetItem | null;
  tabs: string[];
  activeTab: string | null;
  range: string;
  grid: string[][];
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
  const webViewLink =
    (typeof row.webViewLink === "string" && row.webViewLink) ||
    (typeof row.web_view_link === "string" && row.web_view_link) ||
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`;
  return {
    id,
    name,
    modified: formatModified(modifiedRaw),
    modifiedAt: modifiedRaw,
    webViewLink,
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
        Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : [String(row ?? "")],
      );
    }
  }
  if (Array.isArray(payload.values)) {
    return payload.values.map((row) =>
      Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : [String(row ?? "")],
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
  const cached = peekViewCache<SheetsSessionCache>(cacheKey);
  const [page, setPage] = useState<Page>(() => cached?.data.page ?? "browse");
  const [sheets, setSheets] = useState<SheetItem[]>(
    () => cached?.data.sheets ?? [],
  );
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<SheetItem | null>(
    () => cached?.data.selected ?? null,
  );
  const [tabs, setTabs] = useState<string[]>(() => cached?.data.tabs ?? []);
  const [activeTab, setActiveTab] = useState<string | null>(
    () => cached?.data.activeTab ?? null,
  );
  const [status, setStatus] = useState<string | null>(
    () => cached?.data.status ?? null,
  );
  const [error, setError] = useState<string | null>(
    () => cached?.data.error ?? null,
  );
  const [range, setRange] = useState(
    () => cached?.data.range ?? "Sheet1!A1:D20",
  );
  const [grid, setGrid] = useState<string[][]>(() => cached?.data.grid ?? []);
  const [newTitle, setNewTitle] = useState(() => cached?.data.newTitle ?? "");
  const [query, setQuery] = useState(() => cached?.data.query ?? "");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    () => cached?.data.lastSyncedAt ?? null,
  );

  const persist = useCallback(
    (patch: Partial<SheetsSessionCache>) => {
      const prev = peekViewCache<SheetsSessionCache>(cacheKey)?.data;
      writeViewCache(cacheKey, {
        status: patch.status !== undefined ? patch.status : (prev?.status ?? status),
        error: patch.error !== undefined ? patch.error : (prev?.error ?? error),
        page: patch.page ?? prev?.page ?? page,
        sheets: patch.sheets ?? prev?.sheets ?? sheets,
        selected:
          patch.selected !== undefined ? patch.selected : (prev?.selected ?? selected),
        tabs: patch.tabs ?? prev?.tabs ?? tabs,
        activeTab:
          patch.activeTab !== undefined
            ? patch.activeTab
            : (prev?.activeTab ?? activeTab),
        range: patch.range ?? prev?.range ?? range,
        grid: patch.grid ?? prev?.grid ?? grid,
        newTitle: patch.newTitle ?? prev?.newTitle ?? newTitle,
        query: patch.query ?? prev?.query ?? query,
        lastSyncedAt:
          patch.lastSyncedAt !== undefined
            ? patch.lastSyncedAt
            : (prev?.lastSyncedAt ?? lastSyncedAt),
      });
    },
    [
      activeTab,
      cacheKey,
      error,
      grid,
      lastSyncedAt,
      newTitle,
      page,
      query,
      range,
      selected,
      sheets,
      status,
      tabs,
    ],
  );

  const refresh = useCallback(
    async (opts?: { force?: boolean; searchQuery?: string }) => {
      const needle = (opts?.searchQuery ?? query).trim();
      if (
        !opts?.force &&
        peekViewCache<SheetsSessionCache>(cacheKey)?.fresh &&
        sheets.length > 0 &&
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
        persist({
          sheets: parsed,
          status: nextStatus,
          error: null,
          page: "browse",
          query: needle,
          lastSyncedAt: syncedAt,
        });
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
    [cacheKey, persist, query, sheets.length, workspaceId],
  );

  const loadRange = useCallback(
    async (sheet: SheetItem, a1: string) => {
      setBusy(true);
      setError(null);
      try {
        const result = await runConnectorViewOperation({
          workspaceId,
          connectorId: "gsheets",
          operation: "getValues",
          input: { spreadsheetId: sheet.id, range: a1 },
        });
        const nextGrid = extractValueGrid(result.data);
        setGrid(nextGrid);
        setStatus(
          nextGrid.length ? null : "Range is empty — try a different A1 range.",
        );
        persist({ grid: nextGrid, range: a1, status: null, error: null });
      } catch (err) {
        setGrid([]);
        setError(
          err instanceof Error
            ? err.message
            : "Could not read spreadsheet range.",
        );
      } finally {
        setBusy(false);
      }
    },
    [persist, workspaceId],
  );

  const openWorkbook = useCallback(
    async (sheet: SheetItem) => {
      setSelected(sheet);
      setPage("detail");
      setBusy(true);
      setError(null);
      setGrid([]);
      try {
        const result = await runConnectorViewOperation({
          workspaceId,
          connectorId: "gsheets",
          operation: "getSheetNames",
          input: { spreadsheetId: sheet.id },
        });
        const names = Array.isArray(result.data.sheetNames)
          ? result.data.sheetNames.map(String).filter(Boolean)
          : ["Sheet1"];
        const first = names[0] ?? "Sheet1";
        const nextRange = `${first}!A1:D40`;
        setTabs(names);
        setActiveTab(first);
        setRange(nextRange);
        persist({
          selected: sheet,
          page: "detail",
          tabs: names,
          activeTab: first,
          range: nextRange,
          grid: [],
        });
        await loadRange(sheet, nextRange);
      } catch (err) {
        setTabs(["Sheet1"]);
        setActiveTab("Sheet1");
        setError(
          err instanceof Error ? err.message : "Could not load workbook tabs.",
        );
      } finally {
        setBusy(false);
      }
    },
    [loadRange, persist, workspaceId],
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
      };
      if (!created.id) {
        await refresh({ force: true });
        setPage("browse");
        setNewTitle("");
        return;
      }
      setNewTitle("");
      setSheets((prev) => [created, ...prev.filter((row) => row.id !== created.id)]);
      await openWorkbook(created);
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
    persist({
      page,
      sheets,
      selected,
      tabs,
      activeTab,
      range,
      grid,
      newTitle,
      query,
      status,
      error,
      lastSyncedAt,
    });
  }, [
    activeTab,
    error,
    grid,
    lastSyncedAt,
    newTitle,
    page,
    persist,
    query,
    range,
    selected,
    sheets,
    status,
    tabs,
  ]);

  useEffect(() => {
    const onBrowse = page === "browse";
    onToolbarChange?.({
      title:
        page === "create"
          ? "New spreadsheet"
          : page === "range"
            ? "Read range"
            : page === "detail"
              ? selected?.name ?? "Workbook"
              : "Sheets",
      syncing: syncing || busy,
      busy,
      canGoBack: page !== "browse",
      backLabel: page === "range" ? selected?.name ?? "Workbook" : "Sheets",
      primaryLabel:
        page === "detail"
          ? "Open"
          : page === "browse"
            ? "New"
            : page === "create"
              ? "Create"
              : page === "range"
                ? "Load"
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
            typeFilter: "all",
            sortMode: "modified-desc",
            onTypeFilter: () => undefined,
            onSortMode: () => undefined,
          }
        : null,
      onBack: () => {
        if (page === "range") {
          setPage("detail");
          return;
        }
        setPage("browse");
        setSelected(null);
        setActiveTab(null);
        setTabs([]);
        setGrid([]);
      },
      onRefresh: () => {
        if (page === "range" && selected) {
          void loadRange(selected, range);
          return;
        }
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
              : page === "range" && selected
                ? () => void loadRange(selected, range)
                : null,
    });
  }, [
    busy,
    createSpreadsheet,
    lastSyncedAt,
    loadRange,
    onToolbarChange,
    openExternal,
    openWorkbook,
    page,
    query,
    range,
    refresh,
    selected,
    syncing,
  ]);

  return (
    <WorkspacePanelFrame status={status} error={error}>
      {page === "create" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
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

      {page === "range" && selected ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <p className="text-[12px] font-medium text-muted-foreground">
            Read values from {selected.name}
          </p>
          <WorkspaceField
            label="Range (A1)"
            value={range}
            onChange={setRange}
            placeholder="Sheet1!A1:D20"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void loadRange(selected, range)}
            className="inline-flex h-9 w-fit items-center gap-1.5 rounded-full bg-primary px-4 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Load range
          </button>
          <div className="mt-2 overflow-auto rounded-[10px] border border-border">
            {grid.length ? (
              <table className="min-w-full border-collapse text-left text-[11px]">
                <tbody>
                  {grid.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-border/60">
                      {row.map((cell, cellIndex) => (
                        <td
                          key={`${rowIndex}-${cellIndex}`}
                          className="whitespace-pre-wrap px-2 py-1.5 align-top text-foreground/90"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-3 py-4 text-center text-[12px] text-muted-foreground">
                Load a range to preview cell values.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {page === "detail" && selected ? (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {busy ? (
            <div className="pointer-events-none absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur-sm">
              <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.7} />
              Loading…
            </div>
          ) : null}
          <div className="flex gap-1 overflow-x-auto border-b border-black/5 px-2 py-2 dark:border-white/10">
            {(tabs.length ? tabs : ["Sheet1"]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  const nextRange = `${tab}!A1:D40`;
                  setActiveTab(tab);
                  setRange(nextRange);
                  void loadRange(selected, nextRange);
                }}
                className={
                  (activeTab ?? tabs[0] ?? "Sheet1") === tab
                    ? "rounded-full bg-muted px-3 py-1 text-[12px] font-medium"
                    : "rounded-full px-3 py-1 text-[12px] text-muted-foreground hover:bg-muted/70"
                }
              >
                {tab}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage("range")}
              className="ml-auto rounded-full px-3 py-1 text-[12px] text-muted-foreground hover:bg-muted/70"
            >
              Custom range
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {grid.length ? (
              <table className="min-w-full border-collapse text-left text-[11px]">
                <tbody>
                  {grid.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-black/5 dark:border-white/10">
                      {row.map((cell, cellIndex) => (
                        <td
                          key={`${rowIndex}-${cellIndex}`}
                          className="whitespace-pre-wrap px-3 py-2 align-top text-foreground/90"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <ConnectorMark id="gsheets" size="md" className="!h-10 !w-10 !bg-transparent" />
                <p className="text-[13px] font-medium">
                  {busy ? "Loading sheet…" : "No values in this range"}
                </p>
                <p className="max-w-sm text-[12px] text-muted-foreground">
                  Use Open in the bottom bar to view this spreadsheet in Google
                  Sheets, or try a custom range.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {page === "browse" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!sheets.length ? (
              <WorkspaceEmptyState
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
