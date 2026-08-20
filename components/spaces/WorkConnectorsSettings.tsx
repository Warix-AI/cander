"use client";

import { useMemo, useSyncExternalStore } from "react";
import { Plus } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { useApp } from "@/components/app/AppProvider";
import {
  getInstalledConnectorsServerSnapshot,
  getInstalledConnectorsSnapshot,
  mergeConnectorInstalled,
  subscribeInstalledConnectors,
} from "@/lib/connector-install";
import { connectors as seed } from "@/lib/data";
import {
  armWorkConnectorAttach,
  attachWorkConnector,
  detachWorkConnector,
  getWorkConnectorsServerSnapshot,
  getWorkConnectorsSnapshot,
  subscribeWorkConnectors,
  workConnectorIds,
} from "@/lib/work-connectors";
import { cn } from "@/lib/utils";

/** Manage which connectors feed Work — used in Work space settings. */
export function WorkConnectorsSettings() {
  const { workspaceId, openSpace, openConnector, closeOverlay } = useApp();
  useSyncExternalStore(
    subscribeWorkConnectors,
    getWorkConnectorsSnapshot,
    getWorkConnectorsServerSnapshot,
  );
  useSyncExternalStore(
    subscribeInstalledConnectors,
    getInstalledConnectorsSnapshot,
    getInstalledConnectorsServerSnapshot,
  );

  const attachedIds = workConnectorIds(workspaceId);
  const attached = useMemo(() => {
    return attachedIds
      .map((id) => seed.find((item) => item.id === id))
      .filter((item): item is (typeof seed)[number] => Boolean(item))
      .filter((item) => mergeConnectorInstalled(item.id, item.installed));
  }, [attachedIds]);

  const available = useMemo(() => {
    const attachedSet = new Set(attachedIds);
    return seed
      .filter((item) => mergeConnectorInstalled(item.id, item.installed))
      .filter((item) => !attachedSet.has(item.id))
      .slice(0, 12);
  }, [attachedIds]);

  const goAdd = () => {
    armWorkConnectorAttach(workspaceId);
    closeOverlay();
    openSpace("connectors");
  };

  return (
    <div>
      <h2
        id="space-settings-title"
        className="text-[18px] font-semibold tracking-[-0.03em]"
      >
        Connectors
      </h2>
      <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-muted-foreground">
        Attach mail, calendar, chat, and CRM so Work can surface what needs you.
      </p>

      <section className="mt-6">
        <h3 className="text-[13px] font-medium tracking-[-0.01em] text-muted-foreground">
          Attached to Work
        </h3>
        <div className="mt-3 divide-y divide-border rounded-[10px] border border-border">
          {attached.length ? (
            attached.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-3.5 py-3"
              >
                <button
                  type="button"
                  onClick={() => {
                    closeOverlay();
                    openConnector(item.id);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <ConnectorMark id={item.icon} size="sm" />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium tracking-[-0.02em]">
                      {item.name}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                      {item.category}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => detachWorkConnector(workspaceId, item.id)}
                  className="shrink-0 rounded-[8px] px-2.5 py-1.5 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Remove
                </button>
              </div>
            ))
          ) : (
            <p className="px-3.5 py-5 text-[13px] text-muted-foreground">
              No connectors on Work yet. Add mail, calendar, or chat below.
            </p>
          )}
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13px] font-medium tracking-[-0.01em] text-muted-foreground">
            Available
          </h3>
          <button
            type="button"
            onClick={goAdd}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-foreground/15 px-3 text-[12.5px] font-medium tracking-[-0.01em] hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.7} />
            Browse all
          </button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {available.length ? (
            available.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => attachWorkConnector(workspaceId, item.id)}
                className={cn(
                  "flex items-center gap-3 rounded-[10px] border border-border px-3.5 py-3 text-left transition-colors duration-200 hover:border-foreground/20 hover:bg-muted/50",
                )}
              >
                <ConnectorMark id={item.icon} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium tracking-[-0.02em]">
                    {item.name}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-muted-foreground">
                    {item.category}
                  </span>
                </span>
                <Plus
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  strokeWidth={1.7}
                />
              </button>
            ))
          ) : (
            <p className="col-span-full text-[13px] text-muted-foreground">
              Every installed connector is already attached.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
