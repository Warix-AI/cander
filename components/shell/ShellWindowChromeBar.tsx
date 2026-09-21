"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, PanelLeft, Search } from "lucide-react";
import {
  DESKTOP_DRAG,
  DESKTOP_NO_DRAG,
  DESKTOP_TITLEBAR_PX,
  DESKTOP_TRAFFIC_CLEAR_PX,
  useDesktopShell,
} from "@/lib/desktop-shell";
import { cn } from "@/lib/utils";

export const SHELL_HEADER_ICON_CLASS =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/75 transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35";

/** Slightly stronger than Search/Voice — still an icon control, not a CTA button. */
export const SHELL_HEADER_ICON_EMPHASIS_CLASS =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-foreground/85 transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35";

/**
 * Presentational sidebar header row — same geometry as product WindowChrome
 * (traffic-light clear on Electron, 45px panel chrome on web to match
 * connector / browser tab strips).
 */
export function ShellWindowChromeBar({
  clearTrafficLights = false,
  hideHistory = false,
  showHistory = false,
  className,
  leading,
  afterSearch,
  trailing,
  onSearch,
  onBack,
  onForward,
  canGoBack = false,
  canGoForward = false,
}: {
  clearTrafficLights?: boolean;
  hideHistory?: boolean;
  /** Show back/forward (admin). Product chrome uses afterSearch for voice instead. */
  showHistory?: boolean;
  className?: string;
  /** Optional leading control (e.g. PanelLeft). Product chrome may omit this. */
  leading?: ReactNode;
  /** Immediately after Search (e.g. notifications). */
  afterSearch?: ReactNode;
  /** Far-right cluster (e.g. General/Settings) — separated from primary actions. */
  trailing?: ReactNode;
  onSearch?: () => void;
  onBack?: () => void;
  onForward?: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
}) {
  const desktop = useDesktopShell();
  const dragSpacer = desktop ? (
    <div
      className="min-w-3 flex-1 self-stretch"
      style={DESKTOP_DRAG}
      aria-hidden
    />
  ) : (
    <div className="min-w-3 flex-1" aria-hidden />
  );

  return (
    <div
      style={{
        ...(desktop ? DESKTOP_NO_DRAG : undefined),
        // Hard mins — :root sets these vars to 0px; leaving the main app can
        // strip `cander-desktop`, which collapsed admin chrome to the top edge.
        ...(clearTrafficLights
          ? {
              height: `max(${DESKTOP_TITLEBAR_PX}px, var(--desktop-titlebar, ${DESKTOP_TITLEBAR_PX}px))`,
              paddingLeft: `max(${DESKTOP_TRAFFIC_CLEAR_PX}px, var(--desktop-traffic-clear, ${DESKTOP_TRAFFIC_CLEAR_PX}px))`,
            }
          : undefined),
      }}
      className={cn(
        "relative flex shrink-0 items-center gap-1 pr-3",
        // Match connector / browser tab strip (h-[45px]) so the stroke under
        // Search lines up with the stroke under pinned app tabs.
        clearTrafficLights ? undefined : "h-[45px] px-3",
        className,
      )}
    >
      {leading}
      {!hideHistory ? (
        <>
          {leading ? <div className="w-1 shrink-0" aria-hidden /> : null}
          <div
            className="flex shrink-0 items-center gap-1.5"
            style={desktop ? DESKTOP_NO_DRAG : undefined}
          >
            <button
              type="button"
              aria-label="Search"
              style={desktop ? DESKTOP_NO_DRAG : undefined}
              onClick={onSearch}
              disabled={!onSearch}
              className={SHELL_HEADER_ICON_CLASS}
            >
              <Search className="h-4 w-4" strokeWidth={1.7} />
            </button>
            {afterSearch}
            {showHistory ? (
              <>
                <button
                  type="button"
                  aria-label="Back"
                  disabled={!canGoBack}
                  style={desktop ? DESKTOP_NO_DRAG : undefined}
                  onClick={onBack}
                  className={SHELL_HEADER_ICON_CLASS}
                >
                  <ChevronLeft className="h-4 w-4" strokeWidth={1.7} />
                </button>
                <button
                  type="button"
                  aria-label="Forward"
                  disabled={!canGoForward}
                  style={desktop ? DESKTOP_NO_DRAG : undefined}
                  onClick={onForward}
                  className={SHELL_HEADER_ICON_CLASS}
                >
                  <ChevronRight className="h-4 w-4" strokeWidth={1.7} />
                </button>
              </>
            ) : null}
          </div>
          {dragSpacer}
          {trailing ? (
            <div
              className="flex shrink-0 items-center"
              style={desktop ? DESKTOP_NO_DRAG : undefined}
            >
              {trailing}
            </div>
          ) : null}
        </>
      ) : (
        dragSpacer
      )}
    </div>
  );
}

/** PanelLeft control matching NavToggle chrome (for shells without AppProvider). */
export function ShellNavToggleButton({
  onClick,
  label = "Close left panel",
}: {
  onClick: () => void;
  label?: string;
}) {
  const desktop = useDesktopShell();
  return (
    <button
      type="button"
      style={desktop ? DESKTOP_NO_DRAG : undefined}
      aria-label={label}
      onClick={onClick}
      className={SHELL_HEADER_ICON_CLASS}
    >
      <PanelLeft className="h-4 w-4" strokeWidth={1.6} />
    </button>
  );
}
