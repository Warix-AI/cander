"use client";

import type { ReactNode } from "react";
import { PanelLeft, Plus, Search, SquarePen, X } from "lucide-react";
import { PRIMARY_NAV_LABEL, type PrimaryNavSection } from "@/lib/nav-primary";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

const HEADER_ICON =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-muted-foreground transition-colors duration-150 hover:bg-black/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 dark:hover:bg-white/[0.08]";

/**
 * Contextual sidebar chrome — title + section actions above the item list.
 */
export function ContextualNavHeader({
  section,
  onCollapse,
  onPrimaryAction,
  searchOpen,
  onToggleSearch,
  searchValue,
  onSearchChange,
  searchPlaceholder,
}: {
  section: PrimaryNavSection;
  onCollapse: () => void;
  onPrimaryAction: () => void;
  searchOpen: boolean;
  onToggleSearch: () => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
}) {
  const showSearch = section === "apps" || section === "chats";
  const primaryLabel =
    section === "apps"
      ? "Connect app"
      : section === "chats"
        ? "New chat"
        : section === "workspaces"
          ? "Create workspace"
          : "New automation";

  return (
    <div className="flex shrink-0 flex-col gap-2 px-1 pb-1 pt-0.5">
      <div className="flex items-center gap-1">
        <button
          type="button"
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          data-desktop-no-drag=""
          onClick={onCollapse}
          className={HEADER_ICON}
        >
          <PanelLeft className="h-3.5 w-3.5" strokeWidth={1.7} />
        </button>
        <h2 className="min-w-0 flex-1 truncate px-1 text-[13px] font-medium tracking-[-0.01em] text-foreground">
          {PRIMARY_NAV_LABEL[section]}
        </h2>
        {showSearch ? (
          <button
            type="button"
            title="Search"
            aria-label={`Search ${PRIMARY_NAV_LABEL[section].toLowerCase()}`}
            aria-pressed={searchOpen}
            data-desktop-no-drag=""
            onClick={onToggleSearch}
            className={cn(HEADER_ICON, searchOpen && "bg-white/[0.08] text-foreground")}
          >
            <Search className="h-3.5 w-3.5" strokeWidth={1.7} />
          </button>
        ) : null}
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
      </div>

      {showSearch && searchOpen ? (
        <div className="relative px-0.5">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.7}
          />
          <input
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            autoFocus
            className={cn(
              "h-8 w-full border-0 bg-black/[0.04] pl-8 pr-8 text-[13px] text-foreground outline-none placeholder:text-muted-foreground dark:bg-white/[0.06]",
              SHELL_G3_RADIUS,
            )}
          />
          {searchValue ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onSearchChange("")}
              className="absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" strokeWidth={2} />
            </button>
          ) : null}
        </div>
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
