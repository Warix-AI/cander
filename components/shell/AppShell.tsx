"use client";

import { useEffect } from "react";
import { AppProvider, useApp } from "@/components/app/AppProvider";
import { ChatColumn } from "@/components/shell/ChatColumn";
import { Sidebar } from "@/components/shell/Sidebar";
import { MobileBottomNav } from "@/components/shell/MobileBottomNav";
import { SpaceChatLayout } from "@/components/shell/SpaceChatLayout";
import { RecentsView } from "@/components/shell/RecentsView";
import { SplitMainLayout } from "@/components/shell/SplitMainLayout";
import { SettingsView } from "@/components/settings/SettingsView";
import { SharedPanel } from "@/components/panels/SharedPanel";
import { PublishSheet } from "@/components/preview/PublishSheet";
import { SearchModal } from "@/components/overlays/SearchModal";
import { ConfigureModal } from "@/components/overlays/ConfigureModal";
import { SpaceSettingsModal } from "@/components/overlays/SpaceSettingsModal";
import { WorkspaceModal } from "@/components/overlays/WorkspaceModal";
import { InviteWall } from "@/components/overlays/InviteWall";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import {
  getAuthServerSnapshot,
  getAuthSnapshot,
  subscribeAuth,
} from "@/lib/session";
import { useSyncExternalStore } from "react";
import { BrowserLayout } from "@/components/browser/BrowserLayout";
import { FloatingVoiceDock } from "@/components/shell/VoiceControl";
import { AppearanceProvider } from "@/components/theme/AppearanceProvider";
import { isDesktopShell } from "@/lib/desktop-shell";

export function AppShell() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  );
}

function Root() {
  const {
    overlay,
    view,
    openSettings,
    openOverlay,
    closeOverlay,
    canGoBack,
    goBack,
    newChat,
  } = useApp();
  const signedIn = useSyncExternalStore(
    subscribeAuth,
    getAuthSnapshot,
    getAuthServerSnapshot,
  );

  useEffect(() => {
    if (!isDesktopShell()) return;
    document.documentElement.classList.add("cander-desktop");
    return () => {
      document.documentElement.classList.remove("cander-desktop");
    };
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        if (view === "settings") {
          if (canGoBack) goBack();
          else newChat();
        } else openSettings();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (overlay === "search") closeOverlay();
        else openOverlay("search");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    signedIn,
    overlay,
    view,
    openSettings,
    openOverlay,
    closeOverlay,
    canGoBack,
    goBack,
    newChat,
  ]);

  if (!signedIn) {
    return <OnboardingFlow />;
  }

  return (
    <AppearanceProvider>
      <div
        data-app-shell=""
        className="relative flex h-svh min-h-0 flex-1 overflow-hidden bg-background pb-[calc(68px+env(safe-area-inset-bottom))] text-foreground lg:pb-0"
      >
        <Sidebar />
        <CourierMain />
        <SearchModal />
        <ConfigureModal />
        <SpaceSettingsModal />
        <WorkspaceModal />
        <InviteWall />
        <PublishSheet />
        <FloatingVoiceDock />
        <MobileBottomNav />
      </div>
    </AppearanceProvider>
  );
}

function CourierMain() {
  const {
    view,
    drafting,
    thread,
    projectId,
    skillId,
    jobId,
    connectorId,
    spaceLibraryOpen,
  } = useApp();

  if (view === "settings") {
    return (
      <SplitMainLayout>
        <div className="flex min-h-0 flex-1 flex-col">
          <SettingsView />
        </div>
      </SplitMainLayout>
    );
  }

  if (view === "browser") {
    return <BrowserLayout />;
  }

  if (view === "space") {
    const entityOpen = Boolean(
      projectId || skillId || jobId || connectorId || spaceLibraryOpen,
    );
    // Project / connector tools use the normal context panel.
    // Otherwise the space itself slides into the right pane.
    if (entityOpen && (drafting || thread)) {
      return (
        <SplitMainLayout>
          <div className="flex min-h-0 flex-1 flex-col">
            <ChatColumn />
          </div>
        </SplitMainLayout>
      );
    }
    return <SpaceChatLayout />;
  }

  if (view === "recents") {
    return (
      <SplitMainLayout>
        <div className="flex min-h-0 flex-1 flex-col">
          <RecentsView />
        </div>
      </SplitMainLayout>
    );
  }

  if (view === "shared") {
    return (
      <SplitMainLayout>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SharedPanel />
        </div>
      </SplitMainLayout>
    );
  }

  return (
    <SplitMainLayout>
      <div className="flex min-h-0 flex-1 flex-col">
        <ChatColumn />
      </div>
    </SplitMainLayout>
  );
}
