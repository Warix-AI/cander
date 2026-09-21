"use client";

import type { ReactNode } from "react";
import type { PinnedItem } from "@/lib/use-pinned-items";

/**
 * Connected-apps list for the Apps contextual sidebar.
 *
 * Structured so favorites, recent, and reorder can land later without
 * reshaping the Apps section — keep a single scrollable list for now.
 */
export function AppsNavList({
  items,
  renderRow,
  empty,
}: {
  items: PinnedItem[];
  renderRow: (item: PinnedItem) => ReactNode;
  empty?: ReactNode;
}) {
  if (!items.length) {
    return (
      empty ?? (
        <p className="px-2.5 py-3 text-[13px] text-muted-foreground">
          No apps connected yet
        </p>
      )
    );
  }

  return (
    <div
      className="flex min-h-0 flex-col"
      data-apps-nav-list=""
    >
      {/* Future: data-apps-nav-favorites — pinned/favorite apps */}
      <div
        className="flex flex-col gap-0.5"
        data-apps-nav-connected=""
        role="list"
      >
        {items.map((item) => (
          <div key={`${item.kind}-${item.id}`} role="listitem">
            {renderRow(item)}
          </div>
        ))}
      </div>
      {/* Future: data-apps-nav-recent — recently used apps */}
    </div>
  );
}
