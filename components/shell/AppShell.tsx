"use client";

import { useEffect } from "react";
import { AppProvider, useApp } from "@/components/app/AppProvider";
import { ChatColumn } from "@/components/shell/ChatColumn";
import { Sidebar } from "@/components/shell/Sidebar";
import { SpaceChatLayout } from "@/components/shell/SpaceChatLayout";
import { RecentsView } from "@/components/shell/RecentsView";
import { SplitMainLayout } from "@/components/shell/SplitMainLayout";
import { SettingsModal } from "@/components/settings/SettingsView";
import { SharedPanel } from "@/components/panels/SharedPanel";
import { PublishSheet } from "@/components/preview/PublishSheet";
import { PlatformChatLayout } from "@/components/platform/PlatformChatLayout";
import { SearchModal } from "@/components/overlays/SearchModal";
import { ConfigureModal } from "@/components/overlays/ConfigureModal";
import { SpaceSettingsModal } from "@/components/overlays/SpaceSettingsModal";
import { WorkspaceModal } from "@/components/overlays/WorkspaceModal";
import { InviteBanner, InviteWall } from "@/components/overlays/InviteWall";
import { SignInWall } from "@/components/overlays/SignInWall";
import {
  getAuthServerSnapshot,
  getAuthSnapshot,
  subscribeAuth,
} from "@/lib/session";
import { useSyncExternalStore } from "react";
import { BrowserLayout } from "@/components/browser/BrowserLayout";
import { FloatingVoiceDock } from "@/components/shell/VoiceControl";

export function AppShell() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  );
}

function Root() {
  const { mobileNav, setMobileNav, overlay, openSettings, openOverlay, closeOverlay } =
    useApp();
  const signedIn = useSyncExternalStore(
    subscribeAuth,
    getAuthSnapshot,
    getAuthServerSnapshot,
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        if (overlay === "settings") closeOverlay();
        else openSettings();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (overlay === "search") closeOverlay();
        else openOverlay("search");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay, openSettings, openOverlay, closeOverlay]);

  return (
    <>
      <div
        className={`relative flex h-svh overflow-hidden bg-background text-foreground ${signedIn ? "" : "pointer-events-none select-none blur-[2px] opacity-90"}`}
      >
        {mobileNav ? (
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 z-30 bg-foreground/20 lg:hidden"
            onClick={() => setMobileNav(false)}
          />
        ) : null}
        <Sidebar />
        <CourierMain />
        <SettingsModal />
        <SearchModal />
        <ConfigureModal />
        <SpaceSettingsModal />
        <WorkspaceModal />
        <InviteWall />
        <PublishSheet />
        <FloatingVoiceDock />
      </div>
      <SignInWall />
    </>
  );
}

function CourierMain() {
  const {
    product,
    view,
    drafting,
    thread,
    projectId,
    skillId,
    jobId,
    connectorId,
    spaceLibraryOpen,
  } = useApp();

  if (product === "platform") {
    return <PlatformChatLayout />;
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
            <InviteBanner />
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
          <InviteBanner />
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
        <InviteBanner />
        <ChatColumn />
      </div>
    </SplitMainLayout>
  );
}
