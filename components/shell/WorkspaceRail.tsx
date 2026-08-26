"use client";

import { useSyncExternalStore } from "react";
import { Plus } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { WorkspaceMark } from "@/components/shell/WorkspaceMark";
import { workspacesFor } from "@/lib/entitlements";
import {
  DESKTOP_RAIL_WIDTH_PX,
  useDesktopShell,
} from "@/lib/desktop-shell";
import { useShellStyle } from "@/lib/shell-chrome";
import {
  getWorkspaceCatalogServerSnapshot,
  getWorkspaceCatalogSnapshot,
  subscribeWorkspaceCatalog,
} from "@/lib/workspace-catalog";
import { cn } from "@/lib/utils";

export function WorkspaceRail({
  embedded = false,
}: {
  /** Inside a Mac floating panel — no outer titlebar spacer / separate float. */
  embedded?: boolean;
}) {
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
  const macClassic = desktop && !floating && !embedded;
  const macEmbedded = desktop && embedded;

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

  const wide = macClassic || macEmbedded;
  const markSize = wide ? "lg" : "md";
  const railWidth = wide ? DESKTOP_RAIL_WIDTH_PX : 58;

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
          floating || embedded
            ? "hover:bg-muted"
            : "hover:bg-sidebar-accent",
        )}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.7} />
      </button>
    ) : null;

  // Classic Mac: match WindowChrome height so the separator starts under the header.
  const classicHeaderSpacer = macClassic;

  return (
    <div
      className={cn(
        "flex h-full shrink-0 flex-col items-center",
        embedded
          ? "bg-transparent"
          : floating
            ? "bg-transparent"
            : "bg-sidebar",
      )}
      style={{ width: railWidth }}
      aria-label="Workspaces"
    >
      {classicHeaderSpacer ? (
        <div className="h-11 w-full shrink-0" aria-hidden />
      ) : !floating && !embedded ? (
        <div
          className="w-full shrink-0"
          style={{ height: "var(--desktop-titlebar)" }}
          aria-hidden
        />
      ) : null}

      <div
        className={cn(
          "flex min-h-0 w-full flex-1 flex-col items-center",
          !floating && !embedded && "border-r border-sidebar-border",
          embedded && "border-r border-border/80",
        )}
      >
        <div
          className={cn(
            "flex min-h-0 w-full flex-1 flex-col items-center gap-2.5 overflow-y-auto px-2 pb-3",
            embedded || macClassic
              ? "pt-2"
              : floating
                ? "pt-[max(0.75rem,var(--desktop-titlebar))]"
                : "pt-3",
          )}
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
                className={cn(
                  "relative flex shrink-0 items-center justify-center",
                  wide ? "h-10 w-10" : "h-9 w-9",
                )}
              >
                <WorkspaceMark
                  id={item.id}
                  name={item.name}
                  active={active}
                  size={markSize}
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
