"use client";

import { PanelLeft } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
  DESKTOP_NO_DRAG,
  DESKTOP_TRAFFIC_CLEAR_PX,
  useDesktopShell,
} from "@/lib/desktop-shell";
import { SHELL_FLOAT_INSET_PX, useShellStyle } from "@/lib/shell-chrome";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

const WORKSPACE_RAIL_WIDTH_PX = 58;
const CHROME_PAD_PX = 12;

export function NavToggle({
  className,
  onBanner = false,
  docked = false,
}: {
  className?: string;
  onBanner?: boolean;
  /** Fixed on the main canvas when the sidebar is collapsed. */
  docked?: boolean;
}) {
  const {
    sidebarOpen,
    workspaceRailOpen,
    toggleLeftPanel,
    entitlements,
  } = useApp();
  const mobile = useMobileShell();
  const desktop = useDesktopShell();

  if (mobile) return null;

  const canRail =
    entitlements.hasWorkspaces && !entitlements.showInviteWall;
  const open = sidebarOpen;
  const closingRailNext = open && canRail && workspaceRailOpen;

  return (
    <button
      type="button"
      style={desktop ? DESKTOP_NO_DRAG : undefined}
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
        docked
          ? "text-muted-foreground hover:bg-muted hover:text-foreground"
          : onBanner
            ? "text-white/80 hover:bg-white/20 hover:text-white"
            : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-foreground",
        className,
      )}
    >
      <PanelLeft className="h-4 w-4" strokeWidth={1.6} />
    </button>
  );
}

/**
 * Fixed toggle when the sidebar is collapsed.
 * Classic Mac: same spot as WindowChrome — just past the traffic lights —
 * whether the rail was open or not.
 */
export function LeftNavToggleDock({
  showRail,
  peeking,
}: {
  showRail: boolean;
  peeking: boolean;
}) {
  const { sidebarOpen } = useApp();
  const mobile = useMobileShell();
  const floating = useShellStyle() === "floating";
  const desktop = useDesktopShell();

  if (mobile || sidebarOpen || peeking) return null;

  // Classic Mac: stay locked next to the traffic lights across collapse states.
  if (desktop && !floating) {
    return (
      <div
        className="pointer-events-none fixed top-0 z-50 hidden h-[var(--desktop-titlebar,52px)] items-center lg:flex"
        style={{ left: DESKTOP_TRAFFIC_CLEAR_PX, ...DESKTOP_NO_DRAG }}
      >
        <NavToggle docked className="pointer-events-auto" />
      </div>
    );
  }

  const leftPx =
    (showRail
      ? WORKSPACE_RAIL_WIDTH_PX
      : floating
        ? SHELL_FLOAT_INSET_PX
        : 0) + CHROME_PAD_PX;

  return (
    <div
      className={cn(
        "pointer-events-none fixed z-50 hidden h-11 items-center lg:flex",
        floating
          ? "top-[max(0.75rem,var(--desktop-titlebar))]"
          : "top-[var(--desktop-titlebar)]",
      )}
      style={{ left: `${leftPx}px` }}
    >
      <NavToggle docked className="pointer-events-auto" />
    </div>
  );
}
