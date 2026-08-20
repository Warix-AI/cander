"use client";

import { useMemo, useSyncExternalStore } from "react";
import { Plus } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { useApp } from "@/components/app/AppProvider";
import { Dropdown } from "@/components/ui/Controls";
import {
  getInstalledConnectorsServerSnapshot,
  getInstalledConnectorsSnapshot,
  mergeConnectorInstalled,
  subscribeInstalledConnectors,
} from "@/lib/connector-install";
import { connectors as seed } from "@/lib/data";
import {
  armWorkConnectorAttach,
  detachWorkConnector,
  getWorkConnectorsServerSnapshot,
  getWorkConnectorsSnapshot,
  subscribeWorkConnectors,
  workConnectorIds,
} from "@/lib/work-connectors";
import { cn } from "@/lib/utils";

const VISIBLE = 3;

export function WorkConnectorsChip() {
  const { workspaceId, openSpace, openConnector } = useApp();
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

  const attached = useMemo(() => {
    const ids = workConnectorIds(workspaceId);
    return ids
      .map((id) => seed.find((item) => item.id === id))
      .filter((item): item is (typeof seed)[number] => Boolean(item))
      .filter((item) => mergeConnectorInstalled(item.id, item.installed));
  }, [workspaceId]);

  const visible = attached.slice(0, VISIBLE);
  const overflow = Math.max(0, attached.length - VISIBLE);

  const addConnector = (close: () => void) => {
    close();
    armWorkConnectorAttach(workspaceId);
    openSpace("connectors");
  };

  return (
    <Dropdown
      placement="bottom"
      align="end"
      matchTrigger={false}
      menuClassName="w-[18rem] p-1.5"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          aria-expanded={open}
          aria-label="Work connectors"
          onClick={toggle}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-[10px] border border-border bg-transparent px-2.5 transition-colors duration-200 hover:bg-muted",
            open && "bg-muted",
          )}
        >
          <span className="text-[12.5px] font-medium tracking-[-0.01em] text-muted-foreground">
            Connectors
          </span>
          <span className="flex items-center pl-0.5">
            {visible.length ? (
              visible.map((item, index) => (
                <span
                  key={item.id}
                  className="relative rounded-[8px] ring-2 ring-background"
                  style={{ marginLeft: index === 0 ? 0 : -8, zIndex: visible.length - index }}
                >
                  <ConnectorMark id={item.icon} size="xs" />
                </span>
              ))
            ) : (
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-[8px] border border-dashed border-border text-muted-foreground">
                <Plus className="h-3 w-3" strokeWidth={1.8} />
              </span>
            )}
            {overflow > 0 ? (
              <span
                className="relative z-0 ml-[-6px] inline-flex h-6 min-w-6 items-center justify-center rounded-[8px] bg-muted px-1 text-[10px] font-medium ring-2 ring-background"
              >
                +{overflow}
              </span>
            ) : null}
          </span>
        </button>
      )}
    >
      {(close) => (
        <>
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
            Attached to Work
          </p>
          {attached.length ? (
            attached.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 rounded-[10px] px-2 py-1.5 hover:bg-muted"
              >
                <button
                  type="button"
                  onClick={() => {
                    close();
                    openConnector(item.id);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <ConnectorMark id={item.icon} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {item.name}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => detachWorkConnector(workspaceId, item.id)}
                  className="shrink-0 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  Remove
                </button>
              </div>
            ))
          ) : (
            <p className="px-2.5 py-3 text-[12.5px] text-muted-foreground">
              No connectors on Work yet. Add mail, calendar, or chat to feed this space.
            </p>
          )}
          <div className="mt-1 border-t border-border pt-1">
            <button
              type="button"
              onClick={() => addConnector(close)}
              className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-[13px] font-medium transition-colors duration-200 hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.7} />
              Add connector
            </button>
          </div>
        </>
      )}
    </Dropdown>
  );
}
