"use client";

import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import {
  WorkspaceEmptyState,
  WorkspaceField,
  WorkspaceListRow,
  WorkspacePanelFrame,
  type WorkspaceToolbarState,
} from "@/components/connectors/views/WorkspaceViewChrome";
import { GCAL_COMPOSIO_SLUGS } from "@/lib/connectors/google-workspace-composio";

type Page = "agenda" | "detail" | "create";

type StubEvent = {
  id: string;
  summary: string;
  when: string;
  calendar: string;
  location?: string;
  description?: string;
};

/** Structural placeholders until Calendar sync is wired to Composio. */
const DEMO_EVENTS: StubEvent[] = [];

export function CalendarConnectorView({
  onToolbarChange,
}: {
  onToolbarChange?: (state: WorkspaceToolbarState) => void;
}) {
  const [page, setPage] = useState<Page>("agenda");
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState<StubEvent | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [start, setStart] = useState("");
  const [attendees, setAttendees] = useState("");

  const refresh = () => {
    setSyncing(true);
    setStatus(`Will sync via ${GCAL_COMPOSIO_SLUGS["gcal.listEvents"]}`);
    window.setTimeout(() => {
      setSyncing(false);
      setStatus(
        DEMO_EVENTS.length
          ? null
          : "No events yet — connect Calendar to load upcoming events.",
      );
    }, 450);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount sync hint only
  }, []);

  useEffect(() => {
    onToolbarChange?.({
      title:
        page === "create"
          ? "New event"
          : page === "detail"
            ? "Event"
            : "Agenda",
      syncing,
      busy: false,
      canGoBack: page !== "agenda",
      backLabel: "Agenda",
      primaryLabel: page === "agenda" ? "New event" : page === "create" ? "Create" : null,
      onBack: () => {
        setPage("agenda");
        setSelected(null);
      },
      onRefresh: refresh,
      onPrimary:
        page === "agenda"
          ? () => setPage("create")
          : page === "create"
            ? () => {
                setStatus(
                  `Will create via ${GCAL_COMPOSIO_SLUGS["gcal.createEvent"]} / ${GCAL_COMPOSIO_SLUGS["gcal.quickAdd"]}`,
                );
                setPage("agenda");
                setSummary("");
                setStart("");
                setAttendees("");
              }
            : null,
    });
  }, [page, syncing, onToolbarChange, summary, start, attendees]);

  return (
    <WorkspacePanelFrame status={status}>
      {page === "create" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <p className="text-[12px] font-medium text-muted-foreground">
            New event
          </p>
          <WorkspaceField
            label="Title"
            value={summary}
            onChange={setSummary}
            placeholder="Team standup"
          />
          <WorkspaceField
            label="Start"
            value={start}
            onChange={setStart}
            placeholder="Tomorrow 9:00 AM"
          />
          <WorkspaceField
            label="Attendees"
            value={attendees}
            onChange={setAttendees}
            placeholder="alex@company.com"
          />
          <p className="text-[11px] text-muted-foreground">
            Backed by {GCAL_COMPOSIO_SLUGS["gcal.createEvent"]} and{" "}
            {GCAL_COMPOSIO_SLUGS["gcal.quickAdd"]}.
          </p>
        </div>
      ) : null}

      {page === "detail" && selected ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">
            {selected.summary}
          </h2>
          <p className="mt-2 text-[13px] text-muted-foreground">{selected.when}</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {selected.calendar}
          </p>
          {selected.location ? (
            <p className="mt-3 text-[13px]">{selected.location}</p>
          ) : null}
          {selected.description ? (
            <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed">
              {selected.description}
            </p>
          ) : null}
        </div>
      ) : null}

      {page === "agenda" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!DEMO_EVENTS.length ? (
            <WorkspaceEmptyState
              title="No events yet"
              body="Agenda will list upcoming events from your calendars."
              actionLabel="Sync calendars"
              syncing={syncing}
              onAction={refresh}
            />
          ) : (
            DEMO_EVENTS.map((event) => (
              <WorkspaceListRow
                key={event.id}
                title={event.summary}
                subtitle={event.calendar}
                meta={event.when}
                active={selected?.id === event.id}
                onClick={() => {
                  setSelected(event);
                  setPage("detail");
                }}
                leading={
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#1A73E8]/12 text-[#1A73E8]">
                    <CalendarDays className="h-4 w-4" strokeWidth={1.7} />
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
