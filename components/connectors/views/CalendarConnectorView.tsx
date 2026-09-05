"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
  WorkspaceEmptyState,
  WorkspaceField,
  WorkspacePanelFrame,
  type WorkspaceToolbarState,
} from "@/components/connectors/views/WorkspaceViewChrome";
import { runConnectorViewOperation } from "@/lib/api/connector-client";
import { cn } from "@/lib/utils";

type Page = "month" | "detail" | "create";

type CalendarEvent = {
  id: string;
  summary: string;
  when: string;
  startIso: string | null;
  endIso: string | null;
  allDay: boolean;
  location?: string;
  description?: string;
  calendar: string;
  htmlLink?: string;
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function formatMonthLabel(d: Date) {
  return d.toLocaleDateString([], { month: "long", year: "numeric" });
}

function formatEventWhen(startIso: string | null, endIso: string | null, allDay: boolean) {
  if (!startIso) return "";
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return startIso;
  if (allDay) {
    return start.toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }
  const end = endIso ? new Date(endIso) : null;
  const day = start.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const t0 = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (end && !Number.isNaN(end.getTime())) {
    const t1 = end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return `${day} · ${t0} – ${t1}`;
  }
  return `${day} · ${t0}`;
}

function parseEvent(raw: unknown): CalendarEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : null;
  if (!id) return null;
  const summary =
    (typeof row.summary === "string" && row.summary) ||
    (typeof row.title === "string" && row.title) ||
    "(No title)";
  const startObj =
    row.start && typeof row.start === "object"
      ? (row.start as Record<string, unknown>)
      : null;
  const endObj =
    row.end && typeof row.end === "object"
      ? (row.end as Record<string, unknown>)
      : null;
  const startIso =
    (typeof startObj?.dateTime === "string" && startObj.dateTime) ||
    (typeof startObj?.date === "string" && startObj.date) ||
    (typeof row.start === "string" ? row.start : null) ||
    null;
  const endIso =
    (typeof endObj?.dateTime === "string" && endObj.dateTime) ||
    (typeof endObj?.date === "string" && endObj.date) ||
    (typeof row.end === "string" ? row.end : null) ||
    null;
  const allDay = Boolean(startObj?.date && !startObj?.dateTime);
  return {
    id,
    summary,
    startIso,
    endIso,
    allDay,
    when: formatEventWhen(startIso, endIso, allDay),
    location: typeof row.location === "string" ? row.location : undefined,
    description:
      typeof row.description === "string" ? row.description : undefined,
    calendar: "Primary",
    htmlLink: typeof row.htmlLink === "string" ? row.htmlLink : undefined,
  };
}

function monthGrid(anchor: Date) {
  const first = startOfMonth(anchor);
  const startWeekday = first.getDay(); // 0 Sun
  const daysInMonth = new Date(
    anchor.getFullYear(),
    anchor.getMonth() + 1,
    0,
  ).getDate();
  const cells: Array<{ date: Date | null; key: string }> = [];
  for (let i = 0; i < startWeekday; i++) {
    cells.push({ date: null, key: `pad-${i}` });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(anchor.getFullYear(), anchor.getMonth(), day);
    cells.push({ date, key: `d-${day}` });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ date: null, key: `tail-${cells.length}` });
  }
  return cells;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function CalendarConnectorView({
  onToolbarChange,
}: {
  onToolbarChange?: (state: WorkspaceToolbarState) => void;
}) {
  const { workspaceId } = useApp();
  const [page, setPage] = useState<Page>("month");
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [start, setStart] = useState("");
  const [attendees, setAttendees] = useState("");

  const loadEvents = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const timeMin = new Date(
        month.getFullYear(),
        month.getMonth(),
        1,
      ).toISOString();
      const timeMax = new Date(
        month.getFullYear(),
        month.getMonth() + 1,
        1,
      ).toISOString();
      const result = await runConnectorViewOperation({
        workspaceId,
        connectorId: "gcal",
        operation: "listEvents",
        input: { timeMin, timeMax, maxResults: 50, calendarId: "primary" },
      });
      const rawEvents = Array.isArray(result.data.events)
        ? result.data.events
        : [];
      const parsed = rawEvents
        .map(parseEvent)
        .filter((e): e is CalendarEvent => Boolean(e))
        .sort((a, b) => {
          const at = a.startIso ? new Date(a.startIso).getTime() : 0;
          const bt = b.startIso ? new Date(b.startIso).getTime() : 0;
          return at - bt;
        });
      setEvents(parsed);
      setStatus(
        parsed.length
          ? `${parsed.length} event${parsed.length === 1 ? "" : "s"} this month`
          : null,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load calendar. Connect Google Calendar and try again.",
      );
      setEvents([]);
    } finally {
      setSyncing(false);
    }
  }, [month, workspaceId]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const dayEvents = useMemo(() => {
    if (!selectedDay) return events.slice(0, 8);
    return events.filter((event) => {
      if (!event.startIso) return false;
      const d = new Date(event.startIso);
      return sameDay(d, selectedDay);
    });
  }, [events, selectedDay]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of events) {
      if (!event.startIso) continue;
      const d = new Date(event.startIso);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [events]);

  const createEvent = useCallback(async () => {
    if (!summary.trim() || !start.trim()) {
      setError("Add a title and start time.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await runConnectorViewOperation({
        workspaceId,
        connectorId: "gcal",
        operation: "createEvent",
        input: {
          summary: summary.trim(),
          start: start.trim(),
          attendees: attendees.trim() || undefined,
          durationMinutes: 60,
        },
      });
      setStatus("Event created");
      setSummary("");
      setStart("");
      setAttendees("");
      setPage("month");
      await loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create event.");
    } finally {
      setBusy(false);
    }
  }, [attendees, loadEvents, start, summary, workspaceId]);

  useEffect(() => {
    onToolbarChange?.({
      title:
        page === "create"
          ? "New event"
          : page === "detail"
            ? "Event"
            : formatMonthLabel(month),
      syncing,
      busy,
      canGoBack: page !== "month",
      backLabel: "Calendar",
      primaryLabel:
        page === "month" ? "New event" : page === "create" ? "Create" : null,
      onBack: () => {
        setPage("month");
        setSelected(null);
      },
      onRefresh: () => void loadEvents(),
      onPrimary:
        page === "month"
          ? () => {
              setPage("create");
              setError(null);
              setStatus(null);
            }
          : page === "create"
            ? () => void createEvent()
            : null,
    });
  }, [
    page,
    syncing,
    busy,
    month,
    onToolbarChange,
    loadEvents,
    createEvent,
  ]);

  const cells = monthGrid(month);
  const today = new Date();

  return (
    <WorkspacePanelFrame status={status} error={error}>
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
            placeholder="2026-09-05T09:00:00-06:00"
          />
          <WorkspaceField
            label="Attendees"
            value={attendees}
            onChange={setAttendees}
            placeholder="alex@company.com"
          />
          <p className="text-[11px] text-muted-foreground">
            Use an RFC3339 time with timezone (e.g. 2026-09-05T09:00:00-06:00).
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void createEvent()}
            className="inline-flex h-9 w-fit items-center gap-1.5 rounded-full bg-primary px-4 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Create event
          </button>
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
          {selected.htmlLink ? (
            <a
              href={selected.htmlLink}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex text-[12.5px] font-medium text-[#1A73E8] hover:underline"
            >
              Open in Google Calendar
            </a>
          ) : null}
        </div>
      ) : null}

      {page === "month" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center gap-1 border-b border-black/5 px-2 py-2 dark:border-white/10">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonth((m) => addMonths(m, -1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.7} />
            </button>
            <p className="min-w-0 flex-1 text-center text-[13.5px] font-semibold tracking-[-0.01em]">
              {formatMonthLabel(month)}
            </p>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonth((m) => addMonths(m, 1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={1.7} />
            </button>
          </div>

          <div className="grid shrink-0 grid-cols-7 border-b border-black/5 px-2 pt-2 dark:border-white/10">
            {["S", "M", "T", "W", "T", "F", "S"].map((label, i) => (
              <div
                key={`${label}-${i}`}
                className="pb-1 text-center text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="grid shrink-0 grid-cols-7 gap-y-1 px-2 py-2">
            {cells.map((cell) => {
              if (!cell.date) {
                return <div key={cell.key} className="aspect-square" />;
              }
              const key = `${cell.date.getFullYear()}-${cell.date.getMonth()}-${cell.date.getDate()}`;
              const count = eventsByDay.get(key) ?? 0;
              const isToday = sameDay(cell.date, today);
              const isSelected =
                selectedDay != null && sameDay(cell.date, selectedDay);
              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => setSelectedDay(cell.date)}
                  className={cn(
                    "relative flex aspect-square flex-col items-center justify-center rounded-[10px] text-[12.5px] transition-colors",
                    isSelected
                      ? "bg-[#1A73E8] text-white"
                      : isToday
                        ? "bg-[#1A73E8]/12 font-semibold text-[#1A73E8]"
                        : "text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
                  )}
                >
                  {cell.date.getDate()}
                  {count > 0 ? (
                    <span
                      className={cn(
                        "absolute bottom-1 h-1 w-1 rounded-full",
                        isSelected ? "bg-white" : "bg-[#1A73E8]",
                      )}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto border-t border-black/5 dark:border-white/10">
            <div className="flex items-center gap-2 px-4 py-2.5">
              <CalendarDays className="h-3.5 w-3.5 text-[#1A73E8]" strokeWidth={1.7} />
              <p className="text-[12px] font-medium text-muted-foreground">
                {selectedDay
                  ? selectedDay.toLocaleDateString([], {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })
                  : "Upcoming"}
              </p>
              {syncing ? (
                <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : null}
            </div>
            {!dayEvents.length && !syncing ? (
              <WorkspaceEmptyState
                title="Nothing scheduled"
                body="Events for this day will show up here once Calendar is connected and synced."
                actionLabel="Refresh"
                syncing={syncing}
                onAction={() => void loadEvents()}
              />
            ) : (
              dayEvents.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => {
                    setSelected(event);
                    setPage("detail");
                  }}
                  className="flex w-full items-start gap-3 border-b border-black/5 px-4 py-3 text-left transition-colors hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/[0.04]"
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#1A73E8]/12 text-[#1A73E8]">
                    <CalendarDays className="h-4 w-4" strokeWidth={1.7} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium tracking-[-0.01em]">
                      {event.summary}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      {event.when}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </WorkspacePanelFrame>
  );
}
