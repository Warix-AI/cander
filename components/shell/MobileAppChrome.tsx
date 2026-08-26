"use client";

import { Menu, PanelRight, SquarePen } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { APP_NAME } from "@/lib/app-brand";
import { navLabel } from "@/lib/use-main-nav-items";
import { canUseRightPanel } from "@/lib/right-panel";
import { cn } from "@/lib/utils";

/**
 * ChatGPT-style mobile top bar: menu · title · panel / new chat.
 * Desktop / Electron never mounts this.
 */
export function MobileAppChrome({ className }: { className?: string }) {
  const {
    view,
    spaceId,
    thread,
    drafting,
    connectorId,
    projectId,
    jobId,
    skillId,
    sidebarOpen,
    setSidebarOpen,
    mobileSurface,
    setMobileSurface,
    panelMode,
    setPanelMode,
    newChat,
  } = useApp();

  const title =
    spaceId && view !== "settings"
      ? navLabel(spaceId) ?? APP_NAME
      : view === "settings"
        ? "Settings"
        : view === "recents"
          ? "Recents"
          : APP_NAME;

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
  // Spaces always have a right surface (dashboard / tools).
  const panelAvailable = canPanel || view === "space";
  const showingPanel = panelMode !== "collapsed" && mobileSurface === "panel";

  const openMenu = () => setSidebarOpen(true);
  const togglePanel = () => {
    if (!panelAvailable) {
      newChat();
      return;
    }
    if (panelMode === "collapsed") {
      setPanelMode("split");
      setMobileSurface("panel");
      return;
    }
    setMobileSurface(showingPanel ? "chat" : "panel");
  };

  return (
    <header
      className={cn(
        "flex h-12 shrink-0 items-center gap-2 px-3 pt-[env(safe-area-inset-top)]",
        className,
      )}
    >
      <button
        type="button"
        aria-label={sidebarOpen ? "Close menu" : "Open menu"}
        onClick={openMenu}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted/70 text-foreground transition-colors hover:bg-muted"
      >
        <Menu className="h-4 w-4" strokeWidth={1.8} />
      </button>

      <div className="min-w-0 flex-1 text-center">
        <p className="truncate text-[15px] font-medium tracking-[-0.02em]">
          {title}
        </p>
      </div>

      <button
        type="button"
        aria-label={
          panelAvailable
            ? showingPanel
              ? "Show chat"
              : "Open panel"
            : "New chat"
        }
        onClick={togglePanel}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted/70 text-foreground transition-colors hover:bg-muted"
      >
        {panelAvailable ? (
          <PanelRight className="h-4 w-4" strokeWidth={1.8} />
        ) : (
          <SquarePen className="h-4 w-4" strokeWidth={1.8} />
        )}
      </button>
    </header>
  );
}
