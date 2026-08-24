"use client";

import { useApp } from "@/components/app/AppProvider";
import { useMainNavItems } from "@/lib/use-main-nav-items";
import type { SidebarNavId } from "@/lib/spaces";
import { cn } from "@/lib/utils";

export function SpacesSheet({ onSelect }: { onSelect: () => void }) {
  const { view, spaceId, openSpace, openRecents, openBrowser } = useApp();
  const items = useMainNavItems();

  const navActive = (id: SidebarNavId) => {
    if (id === "recents") return view === "recents";
    if (id === "research" && view === "browser") return true;
    return spaceId === id && (view === "space" || view === "chat");
  };

  const openNav = (id: SidebarNavId) => {
    if (id === "browser") openBrowser();
    else if (id === "recents") openRecents();
    else openSpace(id);
    onSelect();
  };

  return (
    <div className="p-2">
      {items.map(({ id, label, Icon }) => {
        const active = navActive(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => openNav(id)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[13.5px] transition-colors duration-200",
              active ? "bg-muted font-medium" : "hover:bg-muted",
            )}
          >
            <Icon
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              strokeWidth={2}
            />
            {label}
          </button>
        );
      })}
    </div>
  );
}
