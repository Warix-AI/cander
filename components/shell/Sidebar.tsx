"use client";

import { History, SquarePen } from "lucide-react";
import { AccountMenu } from "@/components/shell/AccountMenu";
import { ProductSwitcher } from "@/components/shell/ProductSwitcher";
import { WindowChrome } from "@/components/shell/WindowChrome";
import { useApp } from "@/components/app/AppProvider";
import { platformNavItems, spaces } from "@/lib/data";
import { spaceIcons } from "@/lib/space-icons";
import type { SpaceId } from "@/lib/types";
import { cn } from "@/lib/utils";

const navSpaces: SpaceId[] = [
  "build",
  "studio",
  "research",
  "skills",
  "connectors",
  "scheduled",
];

export function Sidebar() {
  const {
    product,
    workspace,
    view,
    spaceId,
    threadId,
    sidebarOpen,
    mobileNav,
    platformNav,
    setPlatformNav,
    setMobileNav,
    newChat,
    openSpace,
    openRecents,
  } = useApp();

  const visible = navSpaces.filter((id) => workspace.spaces.includes(id));
  const chatActive = view === "chat" && !threadId && product === "courier";

  const SpaceBtn = ({ id, className }: { id: SpaceId; className?: string }) => {
    const space = spaces.find((item) => item.id === id);
    if (!space) return null;
    const Icon = spaceIcons[id];
    const active = view === "space" && spaceId === id;
    return (
      <button
        type="button"
        onClick={() => openSpace(id)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors duration-200",
          active ? "bg-sidebar-accent font-medium" : "hover:bg-sidebar-accent",
          className,
        )}
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.6} />
        {space.label}
      </button>
    );
  };

  return (
    <aside
      className={cn(
        "h-full w-[244px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        mobileNav
          ? "absolute inset-y-0 left-0 z-40 flex lg:hidden"
          : "hidden",
        sidebarOpen ? "lg:static lg:flex" : "lg:hidden",
      )}
    >
      <WindowChrome />

      <div className="px-2">
        <ProductSwitcher />
      </div>

      {product === "platform" ? (
        <nav className="mt-2 min-h-0 flex-1 overflow-y-auto px-2" aria-label="Platform">
          {platformNavItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setPlatformNav(item.id);
                setMobileNav(false);
              }}
              className={cn(
                "flex w-full rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors duration-200",
                platformNav === item.id
                  ? "bg-sidebar-accent font-medium"
                  : "hover:bg-sidebar-accent",
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
      ) : (
        <nav className="mt-1 min-h-0 flex-1 overflow-y-auto px-2" aria-label="Primary">
          <button
            type="button"
            onClick={() => newChat()}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors duration-200",
              chatActive
                ? "bg-sidebar-accent font-medium"
                : "hover:bg-sidebar-accent",
            )}
          >
            <SquarePen
              className="h-3.5 w-3.5 text-muted-foreground"
              strokeWidth={1.6}
            />
            New chat
          </button>
          {visible.map((id) => (
            <SpaceBtn key={id} id={id} />
          ))}
          <button
            type="button"
            onClick={openRecents}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors duration-200",
              view === "recents"
                ? "bg-sidebar-accent font-medium"
                : "hover:bg-sidebar-accent",
            )}
          >
            <History
              className="h-3.5 w-3.5 text-muted-foreground"
              strokeWidth={1.6}
            />
            Recents
          </button>
        </nav>
      )}

      <div className="mt-auto p-2">
        <AccountMenu />
      </div>
    </aside>
  );
}
