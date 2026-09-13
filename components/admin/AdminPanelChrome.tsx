"use client";

import { Maximize2, Minimize2, PanelRight } from "lucide-react";
import { useAdmin } from "@/components/admin/AdminProvider";
import {
  BrowserChromeIconButton,
  clearBrowserChromeHovers,
} from "@/components/shell/PanelToggle";
import {
  BROWSER_CHROME_BG,
  BROWSER_CHROME_CHIP_HOVER,
} from "@/lib/shell-chrome";
import { ADMIN_SECTION_LABELS } from "@/lib/admin/sections";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

/**
 * Right-panel header for admin — same geometry as product PanelChrome /
 * connector browser top row (section tab + expand + panel toggle).
 */
export function AdminPanelChrome() {
  const {
    section,
    panelCollapsed,
    setPanelCollapsed,
    panelImmersive,
    setPanelImmersive,
    setSearchOpen,
  } = useAdmin();
  const mobile = useMobileShell();
  const title = ADMIN_SECTION_LABELS[section];

  return (
    <div
      className={cn(
        "flex min-w-0 shrink-0 flex-col",
        BROWSER_CHROME_BG,
      )}
      onPointerLeave={clearBrowserChromeHovers}
    >
      <div className="flex h-[45px] min-w-0 items-center gap-1 px-2">
        <div className="inline-flex h-8 max-w-[14rem] items-center truncate rounded-lg bg-muted/70 px-3 text-[13px] font-medium tracking-[-0.01em]">
          {title}
        </div>
        {mobile ? null : (
          <span className="ml-auto flex shrink-0 items-center gap-0.5">
            <BrowserChromeIconButton
              aria-label={panelImmersive ? "Exit full screen" : "Full screen"}
              onClick={() => setPanelImmersive(!panelImmersive)}
            >
              {panelImmersive ? (
                <Minimize2 className="h-3.5 w-3.5" strokeWidth={1.6} />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.6} />
              )}
            </BrowserChromeIconButton>
            <button
              type="button"
              aria-label={panelCollapsed ? "Open right panel" : "Close right panel"}
              onClick={() => setPanelCollapsed(!panelCollapsed)}
              className={cn(
                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors duration-100",
                BROWSER_CHROME_CHIP_HOVER,
                "hover:text-foreground",
              )}
            >
              <PanelRight className="h-3.5 w-3.5" strokeWidth={1.6} />
            </button>
          </span>
        )}
      </div>
      {mobile ? null : (
        <div className="flex h-10 min-w-0 items-center gap-1 px-2 pb-1.5">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className={cn(
              "mx-auto flex h-8 w-full max-w-[min(100%,22rem)] items-center rounded-full border border-border/60 bg-background/80 px-3 text-left text-[13px] text-muted-foreground",
              "hover:border-border hover:text-foreground",
            )}
          >
            Search admin…
          </button>
        </div>
      )}
    </div>
  );
}
