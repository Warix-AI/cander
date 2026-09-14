"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { useApp } from "@/components/app/AppProvider";
import {
  fetchConnectorConnections,
} from "@/lib/api/connector-client";
import {
  getAppsMoreOpenServerSnapshot,
  getAppsMoreOpenSnapshot,
  subscribeAppsMoreOpen,
  toggleAppsMoreOpen,
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
 * Nested Apps → More discovery: expandable list of unconnected apps with a
 * right-aligned + that opens the existing Connect / Add Account flow.
 */
export function AppsMoreSection({
  listedIds,
  onConnect,
  rowClassName,
  nested = true,
}: {
  listedIds: Iterable<string>;
  onConnect: (connectorId: string) => void;
  /** Optional override for mobile menu row styling. */
  rowClassName?: string;
  /** Extra indent under the Apps pin children. */
  nested?: boolean;
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

  // Keep connection state fresh so More updates after connect / disconnect.
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    void fetchConnectorConnections(workspaceId)
      .then((connections) => {
        if (cancelled) return;
        replaceConnectorConnectionsForWorkspace(workspaceId, connections);
      })
      .catch(() => {
        /* ignore — catalog still usable */
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  if (!available.length) return null;

  const row = cn(
    "flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-[15px] transition-colors duration-200",
    "hover:bg-sidebar-accent",
    rowClassName,
  );

  return (
    <div className={cn("flex flex-col", nested && "mt-0.5")}>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleAppsMoreOpen();
        }}
        aria-expanded={moreOpen}
        className={row}
      >
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          More
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            moreOpen && "rotate-180",
          )}
          strokeWidth={2}
          aria-hidden
        />
      </button>

      {moreOpen ? (
        <div className="flex flex-col pl-3">
          {available.map((app) => (
            <div
              key={app.id}
              className={cn(
                "group relative flex w-full items-center rounded-lg transition-colors duration-200",
                "hover:bg-sidebar-accent",
              )}
            >
              <button
                type="button"
                onClick={() => onConnect(app.id)}
                className="flex min-w-0 flex-1 items-center gap-3 truncate py-1.5 pr-1 pl-1.5 text-left text-[15px]"
              >
                <span className="inline-flex shrink-0">
                  <ConnectorMark id={app.icon} size="nav" />
                </span>
                <span className="min-w-0 flex-1 truncate">{app.name}</span>
              </button>
              <button
                type="button"
                aria-label={`Connect ${app.name}`}
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
          ))}
        </div>
      ) : null}
    </div>
  );
}
