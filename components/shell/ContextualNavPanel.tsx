"use client";

import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { PRIMARY_NAV_LABEL, type PrimaryNavSection } from "@/lib/nav-primary";
import { PRIMARY_NAV_ADD_LABEL } from "@/components/shell/PrimaryNavRail";
import {
  SIDEBAR_ROW,
  SIDEBAR_ROW_HOVER,
  SIDEBAR_ROW_ICON,
} from "@/lib/mobile-menu-styles";
import { cn } from "@/lib/utils";

/**
 * Contextual sidebar — General keeps a quiet title; other sections put the
 * first list row at the top (no title + plus header).
 */
export function ContextualNavHeader({
  section,
}: {
  section: PrimaryNavSection;
}) {
  if (section !== "general") return null;
  return (
    <div className="flex h-10 shrink-0 items-center gap-1 px-1 pb-0 pt-0">
      <h2 className="min-w-0 flex-1 truncate px-1.5 text-[13px] font-medium tracking-[-0.01em] text-foreground">
        {PRIMARY_NAV_LABEL.general}
      </h2>
    </div>
  );
}

/** Trailing “Add …” row under the section’s items. */
export function ContextualAddRow({
  section,
  onClick,
}: {
  section: Exclude<PrimaryNavSection, "general">;
  onClick: () => void;
}) {
  const label = PRIMARY_NAV_ADD_LABEL[section];
  return (
    <button
      type="button"
      data-desktop-no-drag=""
      onClick={onClick}
      className={cn(SIDEBAR_ROW, SIDEBAR_ROW_HOVER, "text-muted-foreground")}
    >
      <Plus className={SIDEBAR_ROW_ICON} strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate text-[14px] tracking-[-0.01em]">
        {label}
      </span>
    </button>
  );
}

export function ContextualSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground/80">
      {children}
    </div>
  );
}
