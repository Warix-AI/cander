"use client";

import { PanelLeft, SquarePen } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
  DESKTOP_NO_DRAG,
  DESKTOP_TRAFFIC_CLEAR_PX,
  useDesktopShell,
} from "@/lib/desktop-shell";
import { SHELL_HEADER_ICON_CLASS } from "@/components/shell/ShellWindowChromeBar";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

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
  const { sidebarOpen, primaryNavRailMode, cycleLeftNav } = useApp();
  const mobile = useMobileShell();
  const desktop = useDesktopShell();

  if (mobile) return null;

  const label = !sidebarOpen
    ? "Open left panel"
    : primaryNavRailMode === "labeled"
      ? "Condense left panel"
      : "Close left panel";

  return (
    <button
      type="button"
      style={desktop ? DESKTOP_NO_DRAG : undefined}
      aria-label={label}
      onClick={() => cycleLeftNav()}
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
 * Fixed PanelLeft + New chat when the entire left nav is hidden.
 * Search + Voice live in the open-menu titlebar next to PanelLeft.
 */
export function LeftNavToggleDock({
  peeking,
}: {
  peeking: boolean;
}) {
  const {
    sidebarOpen,
    projectId,
    drafting,
    thread,
    newChat,
  } = useApp();
  const mobile = useMobileShell();
  const desktop = useDesktopShell();
  const projectFullscreen = Boolean(projectId) && !drafting && !thread;

  if (mobile || sidebarOpen || peeking || projectFullscreen) return null;

  return (
    <div
      className="pointer-events-none fixed top-0 z-50 hidden h-[var(--desktop-titlebar,52px)] items-center gap-1.5 lg:flex"
      style={{
        left: desktop ? DESKTOP_TRAFFIC_CLEAR_PX : 12,
        ...(desktop ? DESKTOP_NO_DRAG : undefined),
      }}
    >
      <NavToggle docked className="pointer-events-auto" />
      <button
        type="button"
        aria-label="New chat"
        title="New chat"
        style={desktop ? DESKTOP_NO_DRAG : undefined}
        onClick={() => newChat()}
        className={cn(SHELL_HEADER_ICON_CLASS, "pointer-events-auto")}
      >
        <SquarePen className="h-4 w-4" strokeWidth={1.7} />
      </button>
    </div>
  );
}
