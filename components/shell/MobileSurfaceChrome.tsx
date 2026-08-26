"use client";

import { MessageSquare, PanelRight, X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { cn } from "@/lib/utils";

/** Toggle between full-screen chat and space/preview on mobile. */
export function MobileSurfaceToggle({
  className,
}: {
  className?: string;
}) {
  const { mobileSurface, setMobileSurface } = useApp();
  const showingChat = mobileSurface !== "panel";

  return (
    <button
      type="button"
      aria-label={showingChat ? "Show space" : "Show chat"}
      title={showingChat ? "Show space" : "Show chat"}
      onClick={() => setMobileSurface(showingChat ? "panel" : "chat")}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {showingChat ? (
        <PanelRight className="h-4 w-4" strokeWidth={1.6} />
      ) : (
        <MessageSquare className="h-4 w-4" strokeWidth={1.6} />
      )}
    </button>
  );
}

/**
 * Header shown on the space/preview surface while chat is armed on mobile,
 * so the user can return to chat or close it without the chat TopRail.
 */
export function MobileArmedPanelChrome({
  onClose,
}: {
  onClose: () => void;
}) {
  return (
    <header className="flex h-11 shrink-0 items-center justify-end gap-1 bg-background px-2 lg:hidden">
      <MobileSurfaceToggle />
      <button
        type="button"
        aria-label="Close chat"
        onClick={onClose}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" strokeWidth={1.6} />
      </button>
    </header>
  );
}
