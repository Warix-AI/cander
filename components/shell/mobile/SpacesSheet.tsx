"use client";

import { SquarePen } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { useMainNavItems } from "@/lib/use-main-nav-items";
import { isChatSpace, isExtraNavId, type SidebarNavId } from "@/lib/spaces";
import { spaceIconTint } from "@/lib/space-icons";
import { cn } from "@/lib/utils";

const rowClass =
  "menu-row-hover flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[13.5px] transition-colors duration-200";

export function SpacesSheet({ onSelect }: { onSelect: () => void }) {
  const {
    view,
    spaceId,
    threadId,
    newChat,
    openSpace,
    openSpaceChat,
    openRecents,
    openBrowser,
  } = useApp();
  const items = useMainNavItems();
  const chatActive = view === "chat" && !threadId && !spaceId;

  const navActive = (id: SidebarNavId) => {
    if (id === "recents") return view === "recents";
    if (id === "research" && view === "browser") return true;
    return spaceId === id && (view === "space" || view === "chat");
  };

  const openNav = (id: SidebarNavId) => {
    if (id === "browser") openBrowser();
    else if (id === "recents") openRecents();
    else if (isChatSpace(id)) openSpaceChat(id);
    else openSpace(id);
    onSelect();
  };

  return (
    <div className="p-2">
      <button
        type="button"
        data-active={chatActive ? "true" : undefined}
        onClick={() => {
          newChat();
          onSelect();
        }}
        className={cn(rowClass, "mb-1", chatActive && "font-medium")}
      >
        <SquarePen
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          strokeWidth={2}
        />
        New Chat
      </button>
      {items.map(({ id, label, Icon }) => {
        const active = navActive(id);
        const tinted =
          id === "work" || id === "build" || id === "research";
        return (
          <button
            key={id}
            type="button"
            data-active={active ? "true" : undefined}
            onClick={() => openNav(id)}
            className={cn(rowClass, active && "font-medium")}
          >
            <Icon
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                tinted ? spaceIconTint(id) : "text-muted-foreground",
              )}
              strokeWidth={2}
            />
            {label}
          </button>
        );
      })}
    </div>
  );
}
