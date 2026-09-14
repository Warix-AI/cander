"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { ChevronUp, Plus } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { useApp } from "@/components/app/AppProvider";
import { fetchConnectorConnections } from "@/lib/api/connector-client";
import {
  getAppsMoreOpenServerSnapshot,
  getAppsMoreOpenSnapshot,
  setAppsMoreOpen,
  subscribeAppsMoreOpen,
} from "@/lib/apps-more-prefs";
import {
  getConnectorConnectionsServerSnapshot,
  getConnectorConnectionsSnapshot,
  replaceConnectorConnectionsForWorkspace,
  subscribeConnectorConnections,
} from "@/lib/connector-connections-store";
import { listSidebarAvailableApps } from "@/lib/sidebar-available-apps";
import { cn } from "@/lib/utils";

/**
 * Apps discovery under connected pins.
 * Collapsed: peer “+ App” row.
 * Expanded: available apps + up chevron to collapse; “+ App” is hidden.
 */
export function AppsMoreSection({
  listedIds,
  onConnect,
}: {
  listedIds: Iterable<string>;
  onConnect: (connectorId: string) => void;
}) {
  const { workspaceId } = useApp();
  const moreOpen = useSyncExternalStore(
    subscribeAppsMoreOpen,
    getAppsMoreOpenSnapshot,
    getAppsMoreOpenServerSnapshot,
  );
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

  if (!available.length) return null;

  if (!moreOpen) {
    return <AddAppRow onOpen={() => setAppsMoreOpen(true)} />;
  }

  return (
    <div className="relative flex flex-col animate-in fade-in slide-in-from-top-1 duration-200">
      {available.map((app, index) => (
        <div key={app.id} className="relative">
          {index === 0 ? (
            <RailChevron
              label="Hide more apps"
              onClick={() => setAppsMoreOpen(false)}
            />
          ) : null}
          <AvailableAppRow
            app={app}
            onPrimary={() => onConnect(app.id)}
            onConnect={onConnect}
          />
        </div>
      ))}
    </div>
  );
}

/** Peer row: + icon + “App” — expands discovery; hidden while More is open. */
function AddAppRow({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-label="Show more apps"
      onClick={onOpen}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-lg py-1.5 pr-1 pl-1.5 text-left text-[15px] transition-colors duration-200",
        "hover:bg-sidebar-accent",
      )}
    >
      <span className="inline-flex shrink-0 text-muted-foreground">
        <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1 truncate">App</span>
    </button>
  );
}

/** Left-rail collapse control — only while available apps are expanded. */
function RailChevron({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "absolute top-1/2 left-0 z-10 flex h-7 w-5 -translate-x-[1.65rem] -translate-y-1/2 items-center justify-center rounded-md",
        "text-muted-foreground opacity-70 transition-colors duration-150 hover:text-foreground",
      )}
    >
      <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.25} />
    </button>
  );
}

function AvailableAppRow({
  app,
  onPrimary,
  onConnect,
}: {
  app: { id: string; name: string; icon: string };
  onPrimary: () => void;
  onConnect: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "group relative flex w-full items-center rounded-lg transition-colors duration-200",
        "hover:bg-sidebar-accent",
      )}
    >
      <button
        type="button"
        onClick={onPrimary}
        className="flex min-w-0 flex-1 items-center gap-3 truncate py-1.5 pr-1 pl-1.5 text-left text-[15px]"
      >
        <span className="inline-flex shrink-0">
          <ConnectorMark id={app.icon} size="nav" />
        </span>
        <span className="min-w-0 flex-1 truncate">{app.name}</span>
      </button>
      <button
        type="button"
        data-app-connect=""
        aria-label={`Open ${app.name}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onConnect(app.id);
        }}
        className="mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.1]"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>
    </div>
  );
}
