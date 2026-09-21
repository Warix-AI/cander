"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { useApp } from "@/components/app/AppProvider";
import { fetchConnectorConnections } from "@/lib/api/connector-client";
import {
  getConnectorConnectionsServerSnapshot,
  getConnectorConnectionsSnapshot,
  replaceConnectorConnectionsForWorkspace,
  subscribeConnectorConnections,
} from "@/lib/connector-connections-store";
import { listSidebarAvailableApps } from "@/lib/sidebar-available-apps";
import { cn } from "@/lib/utils";

/**
 * Catalog apps not yet connected. Click a row to open the app panel; Add
 * still starts the connect flow. Connected apps surface above via pins.
 */
export function AppsMoreSection({
  listedIds,
  onConnect,
  onOpen,
  activeId = null,
  query = "",
}: {
  listedIds: Iterable<string>;
  onConnect: (connectorId: string) => void;
  /** Open the app in the main/right panel (same as a connected pin). */
  onOpen?: (connectorId: string) => void;
  /** Currently open connector — blue selected row. */
  activeId?: string | null;
  /** Optional filter — empty shows the full available list. */
  query?: string;
}) {
  const { workspaceId } = useApp();
  useSyncExternalStore(
    subscribeConnectorConnections,
    getConnectorConnectionsSnapshot,
    getConnectorConnectionsServerSnapshot,
  );

  const listedKey = useMemo(
    () => [...listedIds].sort().join(","),
    [listedIds],
  );

  const available = useMemo(
    () =>
      listSidebarAvailableApps({
        workspaceId,
        listedIds: listedKey ? listedKey.split(",") : [],
      }),
    [workspaceId, listedKey],
  );

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    void fetchConnectorConnections(workspaceId)
      .then((connections) => {
        if (cancelled) return;
        replaceConnectorConnectionsForWorkspace(workspaceId, connections);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? available.filter((app) => app.name.toLowerCase().includes(needle))
    : available;
  if (!matches.length) return null;

  return (
    <div className="relative mt-0.5 flex flex-col gap-0.5">
      {matches.map((app) => (
        <AvailableAppRow
          key={app.id}
          app={app}
          active={activeId === app.id}
          onConnect={onConnect}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function AvailableAppRow({
  app,
  active,
  onConnect,
  onOpen,
}: {
  app: { id: string; name: string; icon: string };
  active: boolean;
  onConnect: (id: string) => void;
  onOpen?: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "group relative flex w-full items-center rounded-[8px] transition-colors duration-150",
        active
          ? "shell-select-active !text-[var(--shell-select-foreground)]"
          : "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
      )}
    >
      <button
        type="button"
        onClick={() => (onOpen ?? onConnect)(app.id)}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 truncate px-2.5 py-2 text-left text-[14px] tracking-[-0.01em]",
          active && "font-medium",
        )}
      >
        <span className="inline-flex shrink-0">
          <ConnectorMark id={app.icon} size="nav" />
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            active ? "text-inherit" : "text-foreground/80",
          )}
        >
          {app.name}
        </span>
      </button>
      <button
        type="button"
        data-app-connect=""
        aria-label={`Add ${app.name}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onConnect(app.id);
        }}
        className={cn(
          "absolute right-1 top-1/2 z-[1] inline-flex h-6 -translate-y-1/2 items-center justify-center rounded-md px-2 text-[12px] font-medium tracking-[-0.01em]",
          "pointer-events-none opacity-0 transition-[opacity,background-color,color] duration-150",
          "group-hover:pointer-events-auto group-hover:opacity-100",
          "focus-visible:pointer-events-auto focus-visible:opacity-100",
          active
            ? "text-[var(--shell-select-foreground)]/90 hover:bg-white/15"
            : "text-muted-foreground hover:bg-[var(--shell-select)] hover:text-[var(--shell-select-foreground)]",
          "focus-visible:bg-[var(--shell-select)] focus-visible:text-[var(--shell-select-foreground)]",
        )}
      >
        Add
      </button>
    </div>
  );
}
