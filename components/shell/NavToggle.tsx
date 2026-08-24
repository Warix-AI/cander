"use client";

import { PanelLeft } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

export function NavToggle({
  className,
  onBanner = false,
}: {
  className?: string;
  onBanner?: boolean;
}) {
  const {
    sidebarOpen,
    workspaceRailOpen,
    toggleLeftPanel,
    entitlements,
  } = useApp();
  const mobile = useMobileShell();

  if (mobile) return null;

  const canRail =
    entitlements.hasWorkspaces && !entitlements.showInviteWall;
  const open = sidebarOpen;
  const closingRailNext = open && canRail && workspaceRailOpen;

  return (
    <button
      type="button"
      aria-label={
        !open
          ? "Open left panel"
          : closingRailNext
            ? "Hide workspaces"
            : "Close left panel"
      }
      onClick={() => toggleLeftPanel()}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-200",
        onBanner
          ? "text-white/80 hover:bg-white/20 hover:text-white"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-foreground",
        className,
      )}
    >
      <PanelLeft className="h-4 w-4" strokeWidth={1.6} />
    </button>
  );
}
