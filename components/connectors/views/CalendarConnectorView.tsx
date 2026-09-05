"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  MapPin,
  Plus,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ACCENT = "#1A73E8";

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function formatMonthLabel(d: Date) {
  return d.toLocaleDateString([], { month: "long", year: "numeric" });
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatEventWhen(
  startIso: string | null,
  endIso: string | null,
  allDay: boolean,
) {
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
  const t0 = start.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  if (end && !Number.isNaN(end.getTime())) {
    const t1 = end.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${day} · ${t0} – ${t1}`;
  }
  return `${day} · ${t0}`;
}

function formatChipTime(startIso: string | null, allDay: boolean) {
  if (!startIso || allDay) return "";
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return "";
  return start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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

/** 6-week grid including adjacent-month days (Google Calendar style). */
function monthGrid(anchor: Date) {
  const first = startOfMonth(anchor);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const cells: Array<{ date: Date; inMonth: boolean; key: string }> = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    cells.push({
      date,
      inMonth: date.getMonth() === anchor.getMonth(),
      key: dayKey(date),
    });
  }
  return cells;
}

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToRfc3339(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${hh}:${mm}`;
}

function defaultCreateStart(day: Date | null) {
  const base = day ? new Date(day) : new Date();
  base.setHours(9, 0, 0, 0);
  return toLocalInputValue(base);
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
  const [startLocal, setStartLocal] = useState(() => defaultCreateStart(new Date()));
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
        input: { timeMin, timeMax, maxResults: 80, calendarId: "primary" },
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
      setStatus(null);
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

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      if (!event.startIso) continue;
      const d = new Date(event.startIso);
      if (Number.isNaN(d.getTime())) continue;
      const key = dayKey(d);
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const dayAgenda = useMemo(() => {
    if (!selectedDay) return [];
    return eventsByDay.get(dayKey(selectedDay)) ?? [];
  }, [eventsByDay, selectedDay]);

  const openCreate = useCallback((day?: Date | null) => {
    const target = day ?? selectedDay ?? new Date();
    setSelectedDay(target);
    setStartLocal(defaultCreateStart(target));
    setSummary("");
    setAttendees("");
    setError(null);
    setStatus(null);
    setPage("create");
  }, [selectedDay]);

  const createEvent = useCallback(async () => {
    if (!summary.trim() || !startLocal.trim()) {
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
          start: localInputToRfc3339(startLocal),
          attendees: attendees.trim() || undefined,
          durationMinutes: 60,
        },
      });
      setStatus("Event created");
      setSummary("");
      setAttendees("");
      setPage("month");
      await loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create event.");
    } finally {
      setBusy(false);
    }
  }, [attendees, loadEvents, startLocal, summary, workspaceId]);

  const goToday = useCallback(() => {
    const now = new Date();
    setMonth(startOfMonth(now));
    setSelectedDay(now);
    setPage("month");
  }, []);

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
      primaryLabel: page === "create" ? "Save" : null,
      onBack: () => {
        setPage("month");
        setSelected(null);
      },
      onRefresh: () => void loadEvents(),
      onPrimary: page === "create" ? () => void createEvent() : null,
      calendarNav:
        page === "month"
          ? {
              onToday: goToday,
              onPrev: () => setMonth((m) => addMonths(m, -1)),
              onNext: () => setMonth((m) => addMonths(m, 1)),
              viewLabel: "Month",
            }
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
    openCreate,
    goToday,
  ]);

  const cells = monthGrid(month);
  const today = new Date();
  const miniCells = monthGrid(month);

  return (
    <WorkspacePanelFrame status={status} error={error}>
      {/* Create — uses panel header back + Save */}
      {page === "create" ? (
        <div className="absolute inset-0 z-20 flex flex-col bg-white dark:bg-space-canvas">
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
                Title
              </span>
              <input
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Add title"
                autoFocus
                className="h-10 w-full rounded-[10px] border border-border bg-transparent px-3 text-[14px] outline-none focus:border-[#1A73E8]/50 focus:ring-2 focus:ring-[#1A73E8]/15"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
                Start
              </span>
              <input
                type="datetime-local"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
                className="h-10 w-full rounded-[10px] border border-border bg-transparent px-3 text-[14px] outline-none focus:border-[#1A73E8]/50 focus:ring-2 focus:ring-[#1A73E8]/15"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
                Guests
              </span>
              <input
                value={attendees}
                onChange={(e) => setAttendees(e.target.value)}
                placeholder="name@email.com"
                className="h-10 w-full rounded-[10px] border border-border bg-transparent px-3 text-[14px] outline-none focus:border-[#1A73E8]/50 focus:ring-2 focus:ring-[#1A73E8]/15"
              />
            </label>
            <p className="text-[12px] text-muted-foreground">
              Events are created on your primary Google Calendar (1 hour).
            </p>
          </div>
        </div>
      ) : null}

      {/* Detail — uses panel header back */}
      {page === "detail" && selected ? (
        <div className="absolute inset-0 z-20 flex flex-col overflow-y-auto bg-white p-5 dark:bg-space-canvas">
          <div
            className="mb-4 h-1.5 w-12 rounded-full"
            style={{ backgroundColor: ACCENT }}
          />
          <h2 className="text-[20px] font-semibold tracking-[-0.03em]">
            {selected.summary}
          </h2>
          <p className="mt-2 text-[13.5px] text-muted-foreground">
            {selected.when}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {selected.calendar}
          </p>
          {selected.location ? (
            <p className="mt-4 flex items-start gap-2 text-[13px]">
              <MapPin
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                strokeWidth={1.7}
              />
              {selected.location}
            </p>
          ) : null}
          {selected.description ? (
            <p className="mt-4 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
              {selected.description}
            </p>
          ) : null}
          {selected.htmlLink ? (
            <a
              href={selected.htmlLink}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex text-[12.5px] font-medium hover:underline"
              style={{ color: ACCENT }}
            >
              Open in Google Calendar
            </a>
          ) : null}
        </div>
      ) : null}

      {/* Month: grid + wider mini-cal on the right */}
      <div className="@container relative flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="grid shrink-0 grid-cols-7 border-b border-black/[0.06] dark:border-white/10">
            {WEEKDAYS.map((label) => (
              <div
                key={label}
                className="px-1 py-2 text-center text-[11px] font-medium tracking-[-0.01em] text-muted-foreground"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 overflow-hidden">
            {cells.map((cell) => {
              const dayEvents = eventsByDay.get(cell.key) ?? [];
              const isToday = sameDay(cell.date, today);
              const isSelected =
                selectedDay != null && sameDay(cell.date, selectedDay);
              const visible = dayEvents.slice(0, 3);
              const more = dayEvents.length - visible.length;

              return (
                <div
                  key={cell.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedDay(cell.date);
                    if (!cell.inMonth) setMonth(startOfMonth(cell.date));
                  }}
                  onDoubleClick={() => openCreate(cell.date)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setSelectedDay(cell.date);
                    }
                  }}
                  className={cn(
                    "group flex min-h-0 flex-col gap-0.5 overflow-hidden border-b border-r border-black/[0.05] p-1 text-left transition-colors dark:border-white/[0.06]",
                    isSelected
                      ? "bg-[#1A73E8]/[0.06]"
                      : "hover:bg-black/[0.02] dark:hover:bg-white/[0.03]",
                    !cell.inMonth && "bg-black/[0.015] dark:bg-white/[0.02]",
                  )}
                >
                  <div className="flex shrink-0 items-center justify-center">
                    <span
                      className={cn(
                        "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] tabular-nums",
                        !cell.inMonth && "text-muted-foreground/50",
                        isToday && "font-semibold text-white",
                        isSelected && !isToday && "font-semibold",
                      )}
                      style={
                        isToday
                          ? { backgroundColor: ACCENT }
                          : isSelected
                            ? { color: ACCENT }
                            : undefined
                      }
                    >
                      {cell.date.getDate()}
                    </span>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                    {visible.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(event);
                          setSelectedDay(cell.date);
                          setPage("detail");
                        }}
                        className="flex min-w-0 items-center gap-0.5 truncate rounded-[4px] px-1 py-0.5 text-left text-[10px] font-medium leading-tight text-white"
                        style={{ backgroundColor: ACCENT }}
                        title={event.summary}
                      >
                        {!event.allDay ? (
                          <span className="shrink-0 opacity-90">
                            {formatChipTime(event.startIso, false)}
                          </span>
                        ) : null}
                        <span className="truncate">{event.summary}</span>
                      </button>
                    ))}
                    {more > 0 ? (
                      <span className="px-1 text-[10px] font-medium text-muted-foreground">
                        +{more} more
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right rail — wider mini calendar for condensed desktop */}
        <aside className="flex w-[min(16rem,42%)] shrink-0 flex-col gap-3 overflow-y-auto border-l border-black/[0.06] p-3 dark:border-white/10">
          <button
            type="button"
            onClick={() => openCreate()}
            className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-white text-[13px] font-medium tracking-[-0.01em] text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.06] transition hover:shadow-[0_2px_8px_rgba(0,0,0,0.12)] dark:bg-zinc-900 dark:ring-white/10"
          >
            <Plus
              className="h-4 w-4"
              strokeWidth={2}
              style={{ color: ACCENT }}
            />
            Create
          </button>

          <div>
            <div className="mb-2 flex items-center justify-between px-0.5">
              <p className="text-[12.5px] font-medium tracking-[-0.01em]">
                {formatMonthLabel(month)}
              </p>
              {syncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : null}
            </div>
            <div className="grid grid-cols-7 gap-y-0.5">
              {["S", "M", "T", "W", "T", "F", "S"].map((label, i) => (
                <div
                  key={`m-${label}-${i}`}
                  className="pb-1 text-center text-[10px] font-medium text-muted-foreground"
                >
                  {label}
                </div>
              ))}
              {miniCells.map((cell) => {
                const isToday = sameDay(cell.date, today);
                const isSelected =
                  selectedDay != null && sameDay(cell.date, selectedDay);
                const hasEvents = (eventsByDay.get(cell.key)?.length ?? 0) > 0;
                return (
                  <button
                    key={`mini-${cell.key}`}
                    type="button"
                    onClick={() => {
                      setSelectedDay(cell.date);
                      if (!cell.inMonth) {
                        setMonth(startOfMonth(cell.date));
                      }
                    }}
                    className={cn(
                      "relative flex h-7 items-center justify-center rounded-full text-[11.5px] transition-colors",
                      !cell.inMonth && "text-muted-foreground/45",
                      isSelected && "text-white",
                      isToday && !isSelected && "font-semibold",
                    )}
                    style={
                      isSelected
                        ? { backgroundColor: ACCENT }
                        : isToday
                          ? { color: ACCENT }
                          : undefined
                    }
                  >
                    {cell.date.getDate()}
                    {hasEvents && !isSelected ? (
                      <span
                        className="absolute bottom-0.5 h-0.5 w-0.5 rounded-full"
                        style={{ backgroundColor: ACCENT }}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-1.5 px-0.5 text-[11px] font-medium text-muted-foreground">
              My calendars
            </p>
            <div className="flex items-center gap-2 rounded-[8px] px-1.5 py-1.5">
              <span
                className="h-3 w-3 shrink-0 rounded-[3px]"
                style={{ backgroundColor: ACCENT }}
              />
              <span className="truncate text-[12.5px]">Primary</span>
            </div>
          </div>

          {selectedDay ? (
            <div className="mt-auto border-t border-black/[0.06] pt-3 dark:border-white/10">
              <p className="mb-2 px-0.5 text-[11px] font-medium text-muted-foreground">
                {selectedDay.toLocaleDateString([], {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </p>
              {dayAgenda.length === 0 ? (
                <p className="px-0.5 text-[11.5px] text-muted-foreground">
                  Nothing scheduled
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {dayAgenda.slice(0, 6).map((event) => (
                    <li key={event.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(event);
                          setPage("detail");
                        }}
                        className="w-full rounded-[8px] px-1.5 py-1 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                      >
                        <p className="truncate text-[12px] font-medium">
                          {event.summary}
                        </p>
                        <p className="truncate text-[10.5px] text-muted-foreground">
                          {formatChipTime(event.startIso, event.allDay) ||
                            "All day"}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </aside>
      </div>
    </WorkspacePanelFrame>
  );
}
