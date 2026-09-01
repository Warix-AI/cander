"use client";

import { Globe, PanelRight } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { canUseRightPanel, isNewChatScreen } from "@/lib/right-panel";
import { SHELL_FLOAT_INSET_PX, useShellStyle } from "@/lib/shell-chrome";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

export function BrowserToggle({
  className,
  docked = false,
}: {
  className?: string;
  docked?: boolean;
}) {
  const { standaloneBrowserOpen, panelMode, toggleStandaloneBrowser } = useApp();
  const active = standaloneBrowserOpen && panelMode !== "collapsed";

  return (
    <button
      type="button"
      aria-label={active ? "Close browser" : "Open browser"}
      onClick={() => toggleStandaloneBrowser()}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-200",
        active
          ? "bg-muted text-foreground"
          : docked
            ? "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <Globe className="h-4 w-4" strokeWidth={1.6} />
    </button>
  );
}

export function PanelToggle({
  className,
  docked = false,
}: {
  className?: string;
  /** Floating dock when the panel is collapsed — matches TopRail / NavToggle styling. */
  docked?: boolean;
}) {
  const { panelMode, toggleRightPanel } = useApp();
  const open = panelMode !== "collapsed";

  return (
    <button
      type="button"
      aria-label={open ? "Close right panel" : "Open right panel"}
      onClick={() => toggleRightPanel()}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-200",
        docked
          ? "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-foreground",
        className,
      )}
    >
      <PanelRight className="h-4 w-4" strokeWidth={1.6} />
    </button>
  );
}

/** Top chrome inside the right panel — toggle anchored top-right, opposite the menu. */
export function PanelWindowChrome() {
  const mobile = useMobileShell();
  if (mobile) return null;

  return (
    <div className="flex h-11 shrink-0 items-center justify-end gap-1 px-3">
      <PanelToggle />
    </div>
  );
}

/** Fixed top-right toggle when the panel is collapsed but available. */
export function RightPanelToggleDock() {
  const {
    view,
    thread,
    threadId,
    drafting,
    spaceId,
    connectorId,
    projectId,
    jobId,
    skillId,
    panelMode,
  } = useApp();
  const mobile = useMobileShell();
  const floating = useShellStyle() === "floating";
  const canPanel = canUseRightPanel({
    view,
    thread,
    drafting,
    spaceId,
    connectorId,
    projectId,
    jobId,
    skillId,
  });
  const panelOpen = panelMode !== "collapsed";
  const onNewChat = isNewChatScreen({
    view,
    threadId,
    thread,
    spaceId,
    projectId,
    drafting,
  });

  if (mobile || !canPanel || panelOpen) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed z-50 hidden h-11 items-center gap-1 bg-background px-3 lg:flex",
        floating ? "top-3" : "top-0",
      )}
      style={{
        right: `${floating ? SHELL_FLOAT_INSET_PX : 0}px`,
      }}
    >
      {onNewChat ? (
        <BrowserToggle docked className="pointer-events-auto" />
      ) : null}
      <PanelToggle docked className="pointer-events-auto" />
    </div>
  );
}
