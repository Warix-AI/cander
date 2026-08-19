"use client";

import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { NavToggle } from "@/components/shell/NavToggle";
import { useApp } from "@/components/app/AppProvider";
import { cn } from "@/lib/utils";

export function WindowChrome() {
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 px-2">
      <NavToggle />
      <HistoryButtons />
    </div>
  );
}

function HistoryButtons() {
  const { canGoBack, canGoForward, goBack, goForward, openOverlay } = useApp();

  return (
    <div className="flex items-center">
      <button
        type="button"
        aria-label="Search"
        onClick={() => openOverlay("search")}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/75 transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground"
      >
        <Search className="h-4 w-4" strokeWidth={1.7} />
      </button>
      <button
        type="button"
        aria-label="Back"
        disabled={!canGoBack}
        onClick={goBack}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/75 transition-colors duration-200",
          canGoBack
            ? "hover:bg-sidebar-accent hover:text-foreground"
            : "opacity-35",
        )}
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.7} />
      </button>
      <button
        type="button"
        aria-label="Forward"
        disabled={!canGoForward}
        onClick={goForward}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/75 transition-colors duration-200",
          canGoForward
            ? "hover:bg-sidebar-accent hover:text-foreground"
            : "opacity-35",
        )}
      >
        <ArrowRight className="h-4 w-4" strokeWidth={1.7} />
      </button>
    </div>
  );
}
