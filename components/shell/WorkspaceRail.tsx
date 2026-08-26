"use client";

import { useSyncExternalStore } from "react";
import { Plus } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { WorkspaceMark } from "@/components/shell/WorkspaceMark";
import { workspacesFor } from "@/lib/entitlements";
import { useShellStyle } from "@/lib/shell-chrome";
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
    openOverlay,
    actor,
    entitlements,
    workspaceRailOpen,
  } = useApp();
  const shellStyle = useShellStyle();
  const floating = shellStyle === "floating";

  useSyncExternalStore(
    subscribeWorkspaceCatalog,
    getWorkspaceCatalogSnapshot,
    getWorkspaceCatalogServerSnapshot,
  );

  const allowed = workspacesFor(actor, entitlements);

  if (
    !entitlements.hasWorkspaces ||
    entitlements.showInviteWall ||
    !workspaceRailOpen ||
    allowed.length < 2
  ) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex h-full w-[58px] shrink-0 flex-col items-center py-3",
        floating
          ? "bg-transparent"
          : "border-r border-sidebar-border bg-sidebar",
      )}
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
              }}
              className="relative flex h-9 w-9 shrink-0 items-center justify-center"
            >
              <WorkspaceMark
                id={item.id}
                name={item.name}
                active={active}
              />
            </button>
          );
        })}
      </div>

      {entitlements.canCreatePersonalWorkspace ||
      entitlements.canCreateBusinessWorkspace ? (
        <button
          type="button"
          title="New workspace"
          aria-label="New workspace"
          onClick={() => openOverlay("workspace")}
          className={cn(
            "mt-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground transition-colors duration-200 hover:text-foreground",
            floating ? "hover:bg-muted" : "hover:bg-sidebar-accent",
          )}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.7} />
        </button>
      ) : null}
    </div>
  );
}
