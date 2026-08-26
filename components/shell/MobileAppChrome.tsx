"use client";

import { ChevronLeft, Menu, SquarePen } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { navLabel } from "@/lib/use-main-nav-items";
import { visibleSettingsTabs } from "@/lib/settings-nav";
import { PRIMARY_NAV_SPACES } from "@/lib/spaces";
import type { SpaceId } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * ChatGPT-style mobile top bar.
 * Home: menu · Chat|{Space} · new chat
 * Menu / settings screens: back · title · (no new chat)
 */
export function MobileAppChrome({ className }: { className?: string }) {
  const {
    view,
    spaceId,
    entitlements,
    mobileSurface,
    setMobileSurface,
    mobileMenuScreen,
    setMobileMenuScreen,
    panelMode,
    setPanelMode,
    newChat,
    settingsMobileHub,
    settingsTab,
    backToSettingsHub,
    canGoBack,
    goBack,
  } = useApp();

  const inSettings = view === "settings";
  const inMenuSub =
    mobileSurface === "menu" && mobileMenuScreen !== "main";
  const inChromeSub = inMenuSub || inSettings;
  const onMenuMain = mobileSurface === "menu" && mobileMenuScreen === "main";

  const settingsNav = visibleSettingsTabs(entitlements);
  const settingsTitle = settingsMobileHub
    ? "Settings"
    : (settingsNav.find((tab) => tab.id === settingsTab)?.label ?? "Settings");

  const subTitle = inSettings
    ? settingsTitle
    : mobileMenuScreen === "pinned"
      ? "Pinned"
      : mobileMenuScreen === "workspace"
        ? "Workspace"
        : "";

  const showSpaceToggle =
    !inChromeSub &&
    !onMenuMain &&
    view === "space" &&
    Boolean(spaceId) &&
    (PRIMARY_NAV_SPACES as readonly string[]).includes(spaceId as string);
  const spaceLabel = spaceId ? navLabel(spaceId as SpaceId) ?? "Space" : "Space";
  const surface =
    mobileSurface === "menu"
      ? "menu"
      : panelMode !== "collapsed" && mobileSurface === "panel"
        ? "panel"
        : "chat";

  const hideNewChat = onMenuMain || inChromeSub;

  const onLeadingClick = () => {
    if (inSettings) {
      if (!settingsMobileHub) {
        backToSettingsHub();
        return;
      }
      if (canGoBack) goBack();
      else newChat();
      setMobileSurface("menu");
      return;
    }
    if (inMenuSub) {
      setMobileMenuScreen("main");
      return;
    }
    setMobileSurface(mobileSurface === "menu" ? "chat" : "menu");
  };

  const setChatOrPanel = (next: "chat" | "panel") => {
    if (!showSpaceToggle) return;
    if (panelMode === "collapsed") setPanelMode("split");
    setMobileSurface(next);
  };

  return (
    <header
      className={cn(
        "shrink-0 bg-background",
        "pt-[env(safe-area-inset-top,0px)]",
        className,
      )}
    >
      <div className="flex h-12 items-center gap-2 px-3">
        <button
          type="button"
          aria-label={
            inChromeSub
              ? "Back"
              : mobileSurface === "menu"
                ? "Close menu"
                : "Open menu"
          }
          aria-pressed={!inChromeSub && mobileSurface === "menu"}
          onClick={onLeadingClick}
          className={cn(
            "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors",
            !inChromeSub && mobileSurface === "menu"
              ? "bg-foreground text-background"
              : "bg-muted/70 text-foreground hover:bg-muted",
          )}
        >
          {inChromeSub ? (
            <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
          ) : (
            <Menu className="h-5 w-5" strokeWidth={1.8} />
          )}
        </button>

        <div className="flex min-w-0 flex-1 items-center justify-center">
          {inChromeSub ? (
            <p className="truncate text-[15px] font-medium tracking-[-0.01em]">
              {subTitle}
            </p>
          ) : showSpaceToggle ? (
            <div
              role="tablist"
              aria-label="Surface"
              className="inline-flex max-w-full items-center rounded-full bg-muted/70 p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={surface === "chat"}
                onClick={() => setChatOrPanel("chat")}
                className={cn(
                  "rounded-full px-4 py-2 text-[14px] font-medium tracking-[-0.01em] transition-colors",
                  surface === "chat"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                Chat
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={surface === "panel"}
                onClick={() => setChatOrPanel("panel")}
                className={cn(
                  "max-w-[9rem] truncate rounded-full px-4 py-2 text-[14px] font-medium tracking-[-0.01em] transition-colors",
                  surface === "panel"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                {spaceLabel}
              </button>
            </div>
          ) : null}
        </div>

        {hideNewChat ? (
          <span className="inline-flex h-11 w-11 shrink-0" aria-hidden />
        ) : (
          <button
            type="button"
            aria-label="New chat"
            onClick={() => {
              newChat();
              setMobileSurface("chat");
            }}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted/70 text-foreground transition-colors hover:bg-muted"
          >
            <SquarePen className="h-5 w-5" strokeWidth={1.8} />
          </button>
        )}
      </div>
    </header>
  );
}
