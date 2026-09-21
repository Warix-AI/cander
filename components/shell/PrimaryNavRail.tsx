"use client";

import {
  Bell,
  CircleHelp,
  CircleUser,
  Layers,
  LayoutGrid,
  MessageSquare,
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
  id: Exclude<PrimaryNavSection, "general">;
  Icon: LucideIcon;
}[] = [
  { id: "apps", Icon: LayoutGrid },
  { id: "workspaces", Icon: Layers },
  { id: "chats", Icon: MessageSquare },
  { id: "automations", Icon: Zap },
];

const RAIL_BTN =
  "inline-flex h-10 w-10 items-center justify-center rounded-[10px] text-muted-foreground transition-colors duration-200 hover:bg-black/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/10 dark:hover:bg-white/[0.08] dark:focus-visible:ring-white/20";

/**
 * Narrow primary icon rail (~56px) — major product sections + account utilities.
 * Search / Voice / collapse live in the desktop titlebar.
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
  const { openHelp, openNotifications, view } = useApp();

  return (
    <aside
      className={cn(
        "flex h-full w-[56px] shrink-0 flex-col items-center py-2",
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
                  "bg-black/[0.06] text-foreground dark:bg-white/[0.1] dark:shadow-[inset_0_0_0_1px_oklch(1_0_0/0.06)]",
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </button>
          );
        })}
      </div>

      <div className="mt-auto flex flex-col items-center gap-1 pb-1">
        <button
          type="button"
          title="Notifications"
          aria-label="Notifications"
          data-desktop-no-drag=""
          onClick={() => openNotifications()}
          className={cn(
            RAIL_BTN,
            view === "notifications" &&
              "bg-black/[0.06] text-foreground dark:bg-white/[0.1]",
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
            view === "help" &&
              "bg-black/[0.06] text-foreground dark:bg-white/[0.1]",
          )}
        >
          <CircleHelp className="h-[17px] w-[17px]" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          title="General"
          aria-label="General"
          data-desktop-no-drag=""
          onClick={() => onSection("general")}
          className={cn(
            RAIL_BTN,
            (section === "general" || view === "settings") &&
              "bg-black/[0.06] text-foreground dark:bg-white/[0.1]",
          )}
        >
          <CircleUser className="h-[17px] w-[17px]" strokeWidth={1.75} />
        </button>
      </div>
    </aside>
  );
}
