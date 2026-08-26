"use client";

import { Check, Plus } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useApp } from "@/components/app/AppProvider";
import { WorkspaceMark } from "@/components/shell/WorkspaceMark";
import { workspacesFor } from "@/lib/entitlements";
import {
  getWorkspaceCatalogServerSnapshot,
  getWorkspaceCatalogSnapshot,
  subscribeWorkspaceCatalog,
} from "@/lib/workspace-catalog";
import { cn } from "@/lib/utils";

const rowClass =
  "menu-row-hover flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13.5px] transition-colors duration-200";

export function WorkspaceSheet({
  onSelect,
  onCreate,
}: {
  onSelect: () => void;
  /** Called after opening the new-workspace flow (optional). */
  onCreate?: () => void;
}) {
  const {
    workspace,
    setWorkspace,
    openOverlay,
    actor,
    entitlements,
  } = useApp();

  useSyncExternalStore(
    subscribeWorkspaceCatalog,
    getWorkspaceCatalogSnapshot,
    getWorkspaceCatalogServerSnapshot,
  );

  const allowed = workspacesFor(actor, entitlements);

  return (
    <div className="px-1 py-1">
      {allowed.map((item) => {
        const active = item.id === workspace.id;
        return (
          <button
            key={item.id}
            type="button"
            data-active={active ? "true" : undefined}
            onClick={() => {
              setWorkspace(item.id);
              onSelect();
            }}
            className={cn(rowClass, active && "bg-muted/70 font-medium")}
          >
            <WorkspaceMark
              id={item.id}
              name={item.name}
              active={active}
              size="sm"
            />
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            {active ? (
              <Check
                className="h-3.5 w-3.5 shrink-0 text-foreground"
                strokeWidth={2}
              />
            ) : null}
          </button>
        );
      })}
      {entitlements.canCreatePersonalWorkspace ||
      entitlements.canCreateBusinessWorkspace ? (
        <button
          type="button"
          onClick={() => {
            openOverlay("workspace");
            (onCreate ?? onSelect)();
          }}
          className={cn(
            rowClass,
            "mt-1 text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-dashed border-border">
            <Plus className="h-3.5 w-3.5" strokeWidth={1.7} />
          </span>
          New workspace
        </button>
      ) : null}
    </div>
  );
}
