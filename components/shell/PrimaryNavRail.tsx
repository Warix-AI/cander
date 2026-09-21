"use client";

import {
  AudioLines,
  Bell,
  CircleHelp,
  CircleUser,
  LayoutGrid,
  MessageSquare,
  PanelsTopLeft,
  Search,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
  PRIMARY_NAV_LABEL,
  type PrimaryNavSection,
} from "@/lib/nav-primary";
import { cn } from "@/lib/utils";

const PRIMARY: {
  id: PrimaryNavSection;
  Icon: LucideIcon;
}[] = [
  { id: "workspaces", Icon: LayoutGrid },
  { id: "chats", Icon: MessageSquare },
  { id: "apps", Icon: PanelsTopLeft },
  { id: "automations", Icon: Zap },
];

const RAIL_BTN =
  "inline-flex h-10 w-10 items-center justify-center rounded-[10px] text-muted-foreground transition-colors duration-150 hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20";

/**
 * Narrow primary icon rail (~56px) — major product sections + utility actions.
 */
export function PrimaryNavRail({
  section,
  onSection,
  className,
}: {
  section: PrimaryNavSection;
  onSection: (next: PrimaryNavSection) => void;
  className?: string;
}) {
  const {
    openSearch,
    openHelp,
    openVoice,
    openSettings,
    openNotifications,
    entitlements,
    view,
  } = useApp();

  return (
    <aside
      className={cn(
        "flex h-full w-[56px] shrink-0 flex-col items-center bg-black/25 py-2 dark:bg-black/40",
        className,
      )}
      aria-label="Primary navigation"
    >
      <div className="flex flex-col items-center gap-1 pt-1" role="tablist">
        {PRIMARY.map(({ id, Icon }) => {
          const active = section === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              title={PRIMARY_NAV_LABEL[id]}
              aria-label={PRIMARY_NAV_LABEL[id]}
              aria-selected={active}
              aria-current={active ? "page" : undefined}
              data-desktop-no-drag=""
              onClick={() => onSection(id)}
              className={cn(
                RAIL_BTN,
                active &&
                  "bg-white/[0.1] text-foreground shadow-[inset_0_0_0_1px_oklch(1_0_0/0.06)]",
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-col items-center gap-1 border-t border-black/[0.06] pt-3 dark:border-white/[0.06]">
        <button
          type="button"
          title="Search"
          aria-label="Search"
          data-desktop-no-drag=""
          onClick={() => openSearch()}
          className={cn(
            RAIL_BTN,
            view === "search" && "bg-white/[0.1] text-foreground",
          )}
        >
          <Search className="h-[17px] w-[17px]" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          title="Notifications"
          aria-label="Notifications"
          data-desktop-no-drag=""
          onClick={() => openNotifications()}
          className={cn(
            RAIL_BTN,
            view === "notifications" && "bg-white/[0.1] text-foreground",
          )}
        >
          <Bell className="h-[17px] w-[17px]" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          title="Help"
          aria-label="Help"
          data-desktop-no-drag=""
          onClick={() => openHelp()}
          className={cn(
            RAIL_BTN,
            view === "help" && "bg-white/[0.1] text-foreground",
          )}
        >
          <CircleHelp className="h-[17px] w-[17px]" strokeWidth={1.75} />
        </button>
      </div>

      <div className="mt-auto flex flex-col items-center gap-1 pb-1">
        {entitlements.hasVoice ? (
          <button
            type="button"
            title="Voice"
            aria-label="Voice"
            data-desktop-no-drag=""
            onClick={() => openVoice()}
            className={cn(
              RAIL_BTN,
              view === "voice" && "bg-white/[0.1] text-foreground",
            )}
          >
            <AudioLines className="h-[17px] w-[17px]" strokeWidth={1.75} />
          </button>
        ) : null}
        <button
          type="button"
          title="Settings"
          aria-label="Settings"
          data-desktop-no-drag=""
          onClick={() => openSettings("general")}
          className={cn(
            RAIL_BTN,
            view === "settings" && "bg-white/[0.1] text-foreground",
          )}
        >
          <CircleUser className="h-[17px] w-[17px]" strokeWidth={1.75} />
        </button>
      </div>
    </aside>
  );
}
