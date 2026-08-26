"use client";

import { ChevronLeft, Menu, SquarePen } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { navLabel } from "@/lib/use-main-nav-items";
import { PRIMARY_NAV_SPACES } from "@/lib/spaces";
import type { SpaceId } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * ChatGPT-style mobile top bar.
 * Home: menu · Chat|{Space} · new chat
 * Menu sub-screen: back · title · (empty)
 */
export function MobileAppChrome({ className }: { className?: string }) {
  const {
    view,
    spaceId,
    workspace,
    mobileSurface,
    setMobileSurface,
    mobileMenuScreen,
    setMobileMenuScreen,
    panelMode,
    setPanelMode,
    newChat,
  } = useApp();

  const inMenuSub =
    mobileSurface === "menu" && mobileMenuScreen !== "main";
  const subTitle =
    mobileMenuScreen === "pinned"
      ? "Pinned"
      : mobileMenuScreen === "workspace"
        ? workspace.name
        : mobileMenuScreen === "account"
          ? "Account"
          : "";

  const showSpaceToggle =
    !inMenuSub &&
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

  const openMenu = () => {
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
            inMenuSub
              ? "Back to menu"
              : mobileSurface === "menu"
                ? "Close menu"
                : "Open menu"
          }
          aria-pressed={!inMenuSub && mobileSurface === "menu"}
          onClick={openMenu}
          className={cn(
            "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors",
            !inMenuSub && mobileSurface === "menu"
              ? "bg-foreground text-background"
              : "bg-muted/70 text-foreground hover:bg-muted",
          )}
        >
          {inMenuSub ? (
            <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
          ) : (
            <Menu className="h-5 w-5" strokeWidth={1.8} />
          )}
        </button>

        <div className="flex min-w-0 flex-1 items-center justify-center">
          {inMenuSub ? (
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

        {inMenuSub ? (
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
