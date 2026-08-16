"use client";

import { useEffect } from "react";
import { AppProvider, useApp } from "@/components/app/AppProvider";
import { ChatColumn } from "@/components/shell/ChatColumn";
import { ContextPanel, ResizeHandle } from "@/components/shell/ContextPanel";
import { Sidebar } from "@/components/shell/Sidebar";
import { SpaceDashboard } from "@/components/shell/SpaceDashboard";
import { RecentsView } from "@/components/shell/RecentsView";
import { TopRail } from "@/components/shell/TopRail";
import { SettingsModal } from "@/components/settings/SettingsView";
import { SharedPanel } from "@/components/panels/SharedPanel";
import { PlatformMain } from "@/components/platform/PlatformShell";
import { WorkspaceModal } from "@/components/overlays/WorkspaceModal";
import { cn } from "@/lib/utils";

export function AppShell() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  );
}

function Root() {
  const { mobileNav, setMobileNav, overlay, openSettings, closeOverlay } =
    useApp();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        if (overlay === "settings") closeOverlay();
        else openSettings();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay, openSettings, closeOverlay]);

  return (
    <div className="relative flex h-svh overflow-hidden bg-background text-foreground">
      {mobileNav ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="absolute inset-0 z-30 bg-foreground/20 lg:hidden"
          onClick={() => setMobileNav(false)}
        />
      ) : null}
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopRail />
        <CourierMain />
      </div>
      <SettingsModal />
      <WorkspaceModal />
    </div>
  );
}

function CourierMain() {
  const { product, view, panelMode, panelRatio } = useApp();

  if (product === "platform") {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-8">
        <PlatformMain />
      </div>
    );
  }

  if (view === "space") return <SpaceDashboard />;
  if (view === "recents") return <RecentsView />;
  if (view === "shared") {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SharedPanel />
      </div>
    );
  }

  const panelOn = panelMode !== "collapsed";
  const immersive = panelMode === "immersive";
  const wide = panelMode === "wide";
  const panelPct = immersive
    ? 100
    : wide
      ? Math.max(panelRatio, 0.58) * 100
      : panelRatio * 100;

  return (
    <div id="courier-main" className="flex min-h-0 min-w-0 flex-1">
      <div
        className={cn(
          "flex min-h-0 min-w-[20rem] flex-col",
          immersive ? "w-[22.5rem] shrink-0" : "min-w-0 flex-1",
        )}
      >
        <ChatColumn />
      </div>
      {panelOn ? (
        <>
          <ResizeHandle />
          <div
            className={cn(immersive ? "min-w-0 flex-1" : "shrink-0")}
            style={immersive ? undefined : { width: `${panelPct}%` }}
          >
            <ContextPanel />
          </div>
        </>
      ) : null}
    </div>
  );
}
