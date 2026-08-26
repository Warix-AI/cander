"use client";

import { useSyncExternalStore } from "react";
import { Plus } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { WorkspaceMark } from "@/components/shell/WorkspaceMark";
import { workspacesFor } from "@/lib/entitlements";
import {
  DESKTOP_FOLDER_SHOULDER_PX,
  useDesktopShell,
} from "@/lib/desktop-shell";
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
  const desktop = useDesktopShell();
  const macFloating = desktop && floating;

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

  const createButton =
    entitlements.canCreatePersonalWorkspace ||
    entitlements.canCreateBusinessWorkspace ? (
      <button
        type="button"
        title="New workspace"
        aria-label="New workspace"
        onClick={() => openOverlay("workspace")}
        className={cn(
          "mb-3 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground transition-colors duration-200 hover:text-foreground",
          floating ? "hover:bg-muted" : "hover:bg-sidebar-accent",
        )}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.7} />
      </button>
    ) : null;

  return (
    <div
      className={cn(
        "flex h-full w-[58px] shrink-0 flex-col items-center",
        floating ? "bg-transparent" : "bg-sidebar",
      )}
      aria-label="Workspaces"
    >
      {!floating ? (
        <div
          className="w-full shrink-0"
          style={{ height: "var(--desktop-titlebar)" }}
          aria-hidden
        />
      ) : null}

      <div
        className={cn(
          "flex min-h-0 w-full flex-1 flex-col items-center",
          !floating && "border-r border-sidebar-border",
        )}
      >
        <div
          className={cn(
            "flex min-h-0 w-full flex-1 flex-col items-center gap-2.5 overflow-y-auto px-2 pb-3",
            !macFloating &&
              (floating
                ? "pt-[max(0.75rem,var(--desktop-titlebar))]"
                : "pt-3"),
          )}
          style={
            macFloating
              ? { paddingTop: DESKTOP_FOLDER_SHOULDER_PX }
              : undefined
          }
        >
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
        {createButton}
      </div>
    </div>
  );
}
