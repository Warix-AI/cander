"use client";

import type { ReactNode } from "react";
import { Plus, SquarePen } from "lucide-react";
import { PRIMARY_NAV_LABEL, type PrimaryNavSection } from "@/lib/nav-primary";

const HEADER_ICON =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-muted-foreground transition-colors duration-150 hover:bg-black/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/10 dark:hover:bg-white/[0.08] dark:focus-visible:ring-white/20";

/**
 * Contextual sidebar chrome — title + primary action.
 * Global Search lives next to PanelLeft in the desktop titlebar.
 */
export function ContextualNavHeader({
  section,
  onPrimaryAction,
}: {
  section: PrimaryNavSection;
  onPrimaryAction?: () => void;
}) {
  if (section === "general") {
    return (
      <div className="flex shrink-0 items-center gap-1 px-1 pb-1 pt-0">
        <h2 className="min-w-0 flex-1 truncate px-1.5 text-[13px] font-medium tracking-[-0.01em] text-foreground">
          {PRIMARY_NAV_LABEL.general}
        </h2>
      </div>
    );
  }

  const primaryLabel =
    section === "apps"
      ? "Connect app"
      : section === "chats"
        ? "New chat"
        : section === "workspaces"
          ? "Create workspace"
          : "New image";

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 px-1 pb-0 pt-0">
      <h2 className="min-w-0 flex-1 truncate px-1.5 text-[13px] font-medium tracking-[-0.01em] text-foreground">
        {PRIMARY_NAV_LABEL[section]}
      </h2>
      {onPrimaryAction ? (
        <button
          type="button"
          title={primaryLabel}
          aria-label={primaryLabel}
          data-desktop-no-drag=""
          onClick={onPrimaryAction}
          className={HEADER_ICON}
        >
          {section === "chats" ? (
            <SquarePen className="h-3.5 w-3.5" strokeWidth={1.7} />
          ) : (
            <Plus className="h-3.5 w-3.5" strokeWidth={1.7} />
          )}
        </button>
      ) : null}
    </div>
  );
}

export function ContextualSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground/80">
      {children}
    </div>
  );
}
