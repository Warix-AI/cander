"use client";

import { platformNavItems } from "@/lib/data";
import {
  allowedItemsForPlatformTab,
  type PlatformMobileTab,
} from "@/lib/platform-mobile-nav";
import { platformNavIcons } from "@/lib/space-icons";
import type { PlatformNav } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PlatformNavSheet({
  tab,
  platformNav,
  allowed,
  onSelect,
}: {
  tab: PlatformMobileTab;
  platformNav: PlatformNav;
  allowed: (nav: PlatformNav) => boolean;
  onSelect: (nav: PlatformNav) => void;
}) {
  const ids = allowedItemsForPlatformTab(tab, allowed);
  const labels = new Map(platformNavItems.map((item) => [item.id, item.label]));

  return (
    <div className="p-2">
      {ids.map((id) => {
        const Icon = platformNavIcons[id];
        const active = platformNav === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[13.5px] transition-colors duration-200",
              active ? "bg-muted font-medium" : "hover:bg-muted",
            )}
          >
            <Icon
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              strokeWidth={2}
            />
            {labels.get(id) ?? id}
          </button>
        );
      })}
    </div>
  );
}
