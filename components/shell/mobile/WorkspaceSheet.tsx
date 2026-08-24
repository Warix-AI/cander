"use client";

import { Plus } from "lucide-react";
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

export function WorkspaceSheet({ onSelect }: { onSelect: () => void }) {
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
    <div className="p-2">
      {allowed.map((item) => {
        const active = item.id === workspace.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setWorkspace(item.id);
              onSelect();
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[13.5px] transition-colors duration-200",
              active ? "bg-muted font-medium" : "hover:bg-muted",
            )}
          >
            <WorkspaceMark id={item.id} name={item.name} active={active} />
            <span className="truncate">{item.name}</span>
          </button>
        );
      })}
      {entitlements.canCreatePersonalWorkspace ||
      entitlements.canCreateBusinessWorkspace ? (
        <button
          type="button"
          onClick={() => {
            openOverlay("workspace");
            onSelect();
          }}
          className="mt-1 flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[13.5px] text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
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
