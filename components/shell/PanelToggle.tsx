"use client";

import { PanelRight } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { canUseRightPanel } from "@/lib/right-panel";
import { useShellStyle } from "@/lib/shell-chrome";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

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
      aria-pressed={open}
      onClick={() => toggleRightPanel()}
      onPointerLeave={(event) => {
        // Electron can leave :hover stuck after the cursor leaves chrome.
        event.currentTarget.blur();
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg transition-colors duration-200",
        docked
          ? "h-8 w-8 bg-background text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
          : "h-7 w-7 text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:bg-black/[0.06] [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground dark:[@media(hover:hover)_and_(pointer:fine)]:hover:bg-white/[0.1]",
        className,
      )}
    >
      <PanelRight className="h-3.5 w-3.5" strokeWidth={1.6} />
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
    drafting,
    spaceId,
    connectorId,
    projectId,
    jobId,
    skillId,
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

  if (mobile || !canPanel) return null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute top-0 right-0 z-50 hidden h-11 items-center gap-1 px-3 lg:flex",
        floating ? "pt-3 pr-3" : "pt-0 pr-3",
      )}
    >
      <PanelToggle docked className="pointer-events-auto bg-background" />
    </div>
  );
}
