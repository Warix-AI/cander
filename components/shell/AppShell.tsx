"use client";

import { useEffect, useLayoutEffect } from "react";
import { AuthProvider } from "@/components/app/AuthProvider";
import { AppProvider, useApp } from "@/components/app/AppProvider";
import { SpaceDataProvider } from "@/components/app/SpaceDataProvider";
import { ChatColumn } from "@/components/shell/ChatColumn";
import { Sidebar } from "@/components/shell/Sidebar";
import { MobileAppChrome } from "@/components/shell/MobileAppChrome";
import { MobileMenuScaffold } from "@/components/shell/MobileMenuScaffold";
import { MobileBootSplash } from "@/components/shell/MobileBootSplash";
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
  getAuthUserIdServerSnapshot,
  getAuthUserIdSnapshot,
  getOnboardingPendingServerSnapshot,
  getOnboardingPendingSnapshot,
  persistOnboardingPending,
  subscribeAuth,
  subscribeAuthUserId,
  subscribeOnboardingPending,
} from "@/lib/session";
import { useSyncExternalStore } from "react";
import { BrowserLayout } from "@/components/browser/BrowserLayout";
import { FloatingVoiceDock } from "@/components/shell/VoiceControl";
import { AppearanceProvider } from "@/components/theme/AppearanceProvider";
import { MobilePanelActionsProvider } from "@/components/shell/mobile/MobilePanelActions";
import { isDesktopShell } from "@/lib/desktop-shell";
import {
  isMobileShell,
  lockMobileViewport,
  useMobileShell as useCapacitorMobileShell,
} from "@/lib/mobile-shell";
import { setShellStyle } from "@/lib/shell-chrome";
import { useMobileShell } from "@/lib/use-media-query";
import { useMobileSwipeGestures } from "@/lib/use-mobile-swipe";
import { MOBILE_APP_BG, MOBILE_MENU_BG } from "@/lib/mobile-menu-styles";
import { cn } from "@/lib/utils";
import {
  getSessionReadyServerSnapshot,
  getSessionReadySnapshot,
  subscribeSessionReady,
} from "@/lib/session-ready";
import {
  getWorkspaceCatalogServerSnapshot,
  getWorkspaceCatalogSnapshot,
  subscribeWorkspaceCatalog,
} from "@/lib/workspace-catalog";
import { isSupabaseConfigured } from "@/lib/data-backend";
import { completeEmailVerificationFromUrl } from "@/lib/auth/email-verify-landing";
import {
  syncSupabaseAuthUser,
} from "@/lib/supabase/auth-store";

export function AppShell() {
  return (
    <AuthProvider>
      <AppProvider>
        <SpaceDataBridge>
          <Root />
        </SpaceDataBridge>
      </AppProvider>
    </AuthProvider>
  );
}

function SpaceDataBridge({ children }: { children: React.ReactNode }) {
  const { workspaceId } = useApp();
  const authUserId = useSyncExternalStore(
    subscribeAuthUserId,
    getAuthUserIdSnapshot,
    getAuthUserIdServerSnapshot,
  );
  return (
    <SpaceDataProvider workspaceId={workspaceId} actorId={authUserId}>
      {children}
    </SpaceDataProvider>
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
  const onboardingPending = useSyncExternalStore(
    subscribeOnboardingPending,
    getOnboardingPendingSnapshot,
    getOnboardingPendingServerSnapshot,
  );
  const sessionReady = useSyncExternalStore(
    subscribeSessionReady,
    getSessionReadySnapshot,
    getSessionReadyServerSnapshot,
  );
  // Email-verify callback — resume onboarding and sync session before paint.
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");
    if (auth === "verified") {
      persistOnboardingPending(true);
    }
    void completeEmailVerificationFromUrl().then((result) => {
      if (result === "verified") {
        persistOnboardingPending(true);
      }
    });
  }, []);

  useCapacitorMobileShell();
  const mobile = useMobileShell();
  const swipe = useMobileSwipeGestures();

  useEffect(() => {
    if (!isDesktopShell()) return;
    document.documentElement.classList.add("cander-desktop");
    return () => {
      document.documentElement.classList.remove("cander-desktop");
    };
  }, []);

  // Phone browser (non-Capacitor): same no-zoom / keyboard lock as the app.
  // Capacitor already locks via useCapacitorMobileShell — don't double-bind.
  useEffect(() => {
    if (!mobile || isDesktopShell()) return;
    document.documentElement.classList.add("cander-narrow");
    if (isMobileShell()) {
      return () => {
        document.documentElement.classList.remove("cander-narrow");
      };
    }
    const unlock = lockMobileViewport();
    return () => {
      unlock();
      document.documentElement.classList.remove("cander-narrow");
    };
  }, [mobile]);

  // Floating chrome is the mobile default.
  useEffect(() => {
    if (!mobile) return;
    setShellStyle("floating");
  }, [mobile]);

  useEffect(() => {
    if (!signedIn) return;
    const params = new URLSearchParams(window.location.search);
    const settings = params.get("settings");
    if (settings === "organization") {
      openSettings("organization");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [signedIn, openSettings]);

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

  const bootstrapping = isSupabaseConfigured() && !sessionReady;

  if (bootstrapping) {
    return (
      <div className="flex h-svh items-center justify-center bg-background text-foreground">
        <p className="text-[14px] text-muted-foreground">Loading your account…</p>
      </div>
    );
  }

  if (!signedIn || onboardingPending) {
    return <OnboardingFlow />;
  }

  return (
    <AuthenticatedShell />
  );
}

function AuthenticatedShell() {
  const { workspaceId, actor } = useApp();
  const workspaceCatalog = useSyncExternalStore(
    subscribeWorkspaceCatalog,
    getWorkspaceCatalogSnapshot,
    getWorkspaceCatalogServerSnapshot,
  );
  const mobile = useMobileShell();
  const swipe = useMobileSwipeGestures();
  const workspaceReady =
    !isSupabaseConfigured() ||
    (workspaceId.trim() !== "" &&
      (workspaceCatalog.some((item) => item.id === workspaceId) ||
        actor.workspaceIds.includes(workspaceId)));

  if (!workspaceReady) {
    return (
      <div className="flex h-svh items-center justify-center bg-background text-foreground">
        <p className="text-[14px] text-muted-foreground">Loading workspace…</p>
      </div>
    );
  }

  return (
    <AppearanceProvider>
      <MobilePanelActionsProvider>
        <div
          data-app-shell=""
          onTouchStart={swipe.onTouchStart}
          onTouchEnd={swipe.onTouchEnd}
          className={cn(
            "relative flex h-svh min-h-0 flex-1 overflow-hidden text-foreground",
            mobile ? MOBILE_MENU_BG : "bg-background",
            // Bottom tab bar removed — no reserved nav inset on mobile.
          )}
        >
          <MobileBootSplash />
          <Sidebar />
          {mobile ? (
            <MobileMenuScaffold>
              <MobileAppChrome />
              <div
                className={cn(
                  "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
                  MOBILE_APP_BG,
                )}
              >
                <CourierMain />
              </div>
            </MobileMenuScaffold>
          ) : (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <CourierMain />
            </div>
          )}
          <SearchModal />
          <ConfigureModal />
          <SpaceSettingsModal />
          <WorkspaceModal />
          <InviteWall />
          <PublishSheet />
          <FloatingVoiceDock />
        </div>
      </MobilePanelActionsProvider>
    </AppearanceProvider>
  );
}

function CourierMain() {
  const {
    view,
    spaceId,
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

  if (view === "space" || (view === "chat" && spaceId)) {
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
