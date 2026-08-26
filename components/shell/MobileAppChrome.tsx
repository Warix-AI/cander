"use client";

import { Menu, SquarePen } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { cn } from "@/lib/utils";

/**
 * ChatGPT-style mobile top bar.
 * Home: menu · · new chat
 * In a space: menu · Left/Right · new chat
 */
export function MobileAppChrome({ className }: { className?: string }) {
  const {
    view,
    spaceId,
    mobileSurface,
    setMobileSurface,
    panelMode,
    setPanelMode,
    newChat,
  } = useApp();

  const inSpace = view === "space" && Boolean(spaceId);
  const surface =
    mobileSurface === "menu"
      ? "menu"
      : panelMode !== "collapsed" && mobileSurface === "panel"
        ? "right"
        : "left";

  const openMenu = () => {
    setMobileSurface(mobileSurface === "menu" ? "chat" : "menu");
  };

  const setChatOrPanel = (next: "left" | "right") => {
    if (!inSpace) return;
    if (panelMode === "collapsed") setPanelMode("split");
    setMobileSurface(next === "right" ? "panel" : "chat");
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
          aria-label={mobileSurface === "menu" ? "Close menu" : "Open menu"}
          aria-pressed={mobileSurface === "menu"}
          onClick={openMenu}
          className={cn(
            "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors",
            mobileSurface === "menu"
              ? "bg-foreground text-background"
              : "bg-muted/70 text-foreground hover:bg-muted",
          )}
        >
          <Menu className="h-5 w-5" strokeWidth={1.8} />
        </button>

        <div className="flex min-w-0 flex-1 items-center justify-center">
          {inSpace ? (
            <div
              role="tablist"
              aria-label="Surface"
              className="inline-flex items-center rounded-full bg-muted/70 p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={surface === "left"}
                onClick={() => setChatOrPanel("left")}
                className={cn(
                  "rounded-full px-4 py-2 text-[14px] font-medium tracking-[-0.01em] transition-colors",
                  surface === "left"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                Left
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={surface === "right"}
                onClick={() => setChatOrPanel("right")}
                className={cn(
                  "rounded-full px-4 py-2 text-[14px] font-medium tracking-[-0.01em] transition-colors",
                  surface === "right"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                Right
              </button>
            </div>
          ) : null}
        </div>

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
      </div>
    </header>
  );
}
