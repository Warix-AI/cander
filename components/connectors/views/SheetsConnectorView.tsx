"use client";

import { useEffect, useState } from "react";
import { Table2 } from "lucide-react";
import {
  WorkspaceEmptyState,
  WorkspaceField,
  WorkspaceListRow,
  WorkspacePanelFrame,
  type WorkspaceToolbarState,
} from "@/components/connectors/views/WorkspaceViewChrome";
import { GSHEETS_COMPOSIO_SLUGS } from "@/lib/connectors/google-workspace-composio";

type Page = "spreadsheets" | "workbook" | "range" | "create";

type StubSheet = {
  id: string;
  name: string;
  tabs: string[];
  modified: string;
};

const DEMO_SHEETS: StubSheet[] = [];

export function SheetsConnectorView({
  onToolbarChange,
}: {
  onToolbarChange?: (state: WorkspaceToolbarState) => void;
}) {
  const [page, setPage] = useState<Page>("spreadsheets");
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState<StubSheet | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [range, setRange] = useState("Sheet1!A1:D20");
  const [newTitle, setNewTitle] = useState("");

  const refresh = () => {
    setSyncing(true);
    setStatus(`Will search via ${GSHEETS_COMPOSIO_SLUGS["gsheets.search"]}`);
    window.setTimeout(() => {
      setSyncing(false);
      setStatus(
        DEMO_SHEETS.length
          ? null
          : "No spreadsheets yet — connect Sheets to browse workbooks.",
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
          ? "New spreadsheet"
          : page === "range"
            ? "Read range"
            : page === "workbook"
              ? selected?.name ?? "Workbook"
              : "Sheets",
      syncing,
      busy: false,
      canGoBack: page !== "spreadsheets",
      backLabel: page === "range" ? "Workbook" : "Sheets",
      primaryLabel:
        page === "spreadsheets"
          ? "New"
          : page === "workbook"
            ? "Read range"
            : page === "create"
              ? "Create"
              : null,
      onBack: () => {
        if (page === "range") {
          setPage("workbook");
          return;
        }
        setPage("spreadsheets");
        setSelected(null);
        setActiveTab(null);
      },
      onRefresh: refresh,
      onPrimary:
        page === "spreadsheets"
          ? () => setPage("create")
          : page === "workbook"
            ? () => setPage("range")
            : page === "create"
              ? () =>
                  setStatus(
                    `Will create via ${GSHEETS_COMPOSIO_SLUGS["gsheets.create"]}`,
                  )
              : null,
    });
  }, [page, syncing, onToolbarChange, selected, activeTab, range, newTitle]);

  return (
    <WorkspacePanelFrame status={status}>
      {page === "create" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <WorkspaceField
            label="Title"
            value={newTitle}
            onChange={setNewTitle}
            placeholder="Q4 plan"
          />
          <p className="text-[11px] text-muted-foreground">
            Backed by {GSHEETS_COMPOSIO_SLUGS["gsheets.create"]}.
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
            onClick={() =>
              setStatus(
                `Will read via ${GSHEETS_COMPOSIO_SLUGS["gsheets.valuesGet"]} / ${GSHEETS_COMPOSIO_SLUGS["gsheets.batchGet"]}`,
              )
            }
            className="inline-flex h-9 w-fit items-center rounded-full bg-primary px-4 text-[12.5px] font-medium text-primary-foreground"
          >
            Load range
          </button>
          <div className="mt-2 overflow-hidden rounded-[10px] border border-border">
            <div className="grid grid-cols-4 gap-px bg-border">
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={index}
                  className="min-h-9 bg-white px-2 py-2 text-[11px] text-muted-foreground dark:bg-space-canvas"
                >
                  {index < 4 ? String.fromCharCode(65 + index) : ""}
                </div>
              ))}
            </div>
            <p className="px-3 py-4 text-center text-[12px] text-muted-foreground">
              Grid preview appears after values sync.
            </p>
          </div>
        </div>
      ) : null}

      {page === "workbook" && selected ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-black/5 px-3 py-2 dark:border-white/10">
            <p className="truncate text-[13px] font-medium">{selected.name}</p>
            <p className="text-[11px] text-muted-foreground">
              Tabs via {GSHEETS_COMPOSIO_SLUGS["gsheets.sheetNames"]}
            </p>
          </div>
          <div className="flex gap-1 overflow-x-auto border-b border-black/5 px-2 py-2 dark:border-white/10">
            {(selected.tabs.length ? selected.tabs : ["Sheet1"]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={
                  (activeTab ?? selected.tabs[0] ?? "Sheet1") === tab
                    ? "rounded-full bg-muted px-3 py-1 text-[12px] font-medium"
                    : "rounded-full px-3 py-1 text-[12px] text-muted-foreground hover:bg-muted/70"
                }
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-[12px] text-muted-foreground">
            Select Read range to pull cells for{" "}
            {activeTab ?? selected.tabs[0] ?? "Sheet1"}.
          </div>
        </div>
      ) : null}

      {page === "spreadsheets" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!DEMO_SHEETS.length ? (
            <WorkspaceEmptyState
              title="No spreadsheets yet"
              body="Workbooks will list here after Sheets search is connected."
              actionLabel="Search Sheets"
              syncing={syncing}
              onAction={refresh}
            />
          ) : (
            DEMO_SHEETS.map((sheet) => (
              <WorkspaceListRow
                key={sheet.id}
                title={sheet.name}
                subtitle={`${sheet.tabs.length} tabs`}
                meta={sheet.modified}
                active={selected?.id === sheet.id}
                onClick={() => {
                  setSelected(sheet);
                  setActiveTab(sheet.tabs[0] ?? null);
                  setPage("workbook");
                }}
                leading={
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                    <Table2 className="h-4 w-4" strokeWidth={1.7} />
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
