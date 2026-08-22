"use client";

import { useSyncExternalStore } from "react";
import { Plus } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { WorkspaceMark } from "@/components/shell/WorkspaceMark";
import { workspacesFor } from "@/lib/entitlements";
import {
  getWorkspaceCatalogServerSnapshot,
  getWorkspaceCatalogSnapshot,
  subscribeWorkspaceCatalog,
} from "@/lib/workspace-catalog";
import { cn } from "@/lib/utils";

export function WorkspaceRail() {
  const {
    workspace,
    setWorkspace,
    setMobileNav,
    openOverlay,
    actor,
    entitlements,
    workspaceRailOpen,
  } = useApp();

  useSyncExternalStore(
    subscribeWorkspaceCatalog,
    getWorkspaceCatalogSnapshot,
    getWorkspaceCatalogServerSnapshot,
  );

  if (
    !entitlements.hasWorkspaces ||
    entitlements.showInviteWall ||
    !workspaceRailOpen
  ) {
    return null;
  }

  const allowed = workspacesFor(actor, entitlements);

  return (
    <div
      className="flex h-full w-[58px] shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar py-3"
      aria-label="Workspaces"
    >
      <div className="flex min-h-0 flex-1 flex-col items-center gap-2.5 overflow-y-auto px-2 pt-1">
        {allowed.map((item) => {
          const active = item.id === workspace.id;
          return (
            <button
              key={item.id}
              type="button"
              title={item.name}
              aria-label={item.name}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                setWorkspace(item.id);
                setMobileNav(false);
              }}
              className="group relative flex h-9 w-9 shrink-0 items-center justify-center"
            >
              <span
                aria-hidden
                className={cn(
                  "absolute top-1/2 -left-2 w-1 -translate-y-1/2 rounded-full bg-foreground transition-all duration-200",
                  active ? "h-5" : "h-0 group-hover:h-2.5",
                )}
              />
              <WorkspaceMark
                id={item.id}
                name={item.name}
                active={active}
                className={
                  !active
                    ? "transition-colors duration-200 group-hover:bg-sidebar-accent"
                    : undefined
                }
              />
            </button>
          );
        })}
      </div>

      {entitlements.canManageWorkspaces ? (
        <button
          type="button"
          title="New workspace"
          aria-label="New workspace"
          onClick={() => openOverlay("workspace")}
          className="mt-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.7} />
        </button>
      ) : null}
    </div>
  );
}
