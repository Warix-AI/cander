"use client";

import { PanelLeft, Search } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
  DESKTOP_NO_DRAG,
  DESKTOP_TRAFFIC_CLEAR_PX,
  useDesktopShell,
} from "@/lib/desktop-shell";
import { SHELL_HEADER_ICON_CLASS } from "@/components/shell/ShellWindowChromeBar";
import { VoiceWaveIcon } from "@/components/shell/VoiceOrb";
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
  const { sidebarOpen, setSidebarOpen } = useApp();
  const mobile = useMobileShell();
  const desktop = useDesktopShell();

  if (mobile) return null;

  return (
    <button
      type="button"
      style={desktop ? DESKTOP_NO_DRAG : undefined}
      aria-label={sidebarOpen ? "Close left panel" : "Open left panel"}
      onClick={() => setSidebarOpen(!sidebarOpen)}
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
 * Fixed PanelLeft + Search + Voice when the entire left nav is hidden.
 * Single control cluster — avoids stacking a second toggle under Search.
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
    openSearch,
    openVoice,
    entitlements,
    view,
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
        aria-label="Search"
        style={desktop ? DESKTOP_NO_DRAG : undefined}
        onClick={() => openSearch()}
        className={cn(SHELL_HEADER_ICON_CLASS, "pointer-events-auto")}
      >
        <Search className="h-4 w-4" strokeWidth={1.7} />
      </button>
      {entitlements.hasVoice ? (
        <button
          type="button"
          aria-label="Voice"
          title="Voice"
          style={desktop ? DESKTOP_NO_DRAG : undefined}
          onClick={() => openVoice()}
          className={cn(
            SHELL_HEADER_ICON_CLASS,
            "pointer-events-auto",
            view === "voice" && "bg-muted text-foreground",
          )}
        >
          <VoiceWaveIcon size={14} />
        </button>
      ) : null}
    </div>
  );
}
