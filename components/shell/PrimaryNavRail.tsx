"use client";

import {
  Bell,
  CircleHelp,
  CircleUser,
  Layers,
  LayoutGrid,
  MessageSquare,
  Search,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { CanderMark } from "@/components/brand/CanderMark";
import { VoiceWaveIcon } from "@/components/shell/VoiceOrb";
import {
  PRIMARY_NAV_LABEL,
  type PrimaryNavSection,
} from "@/lib/nav-primary";
import { cn } from "@/lib/utils";

const PRIMARY: {
  id: Exclude<PrimaryNavSection, "general">;
  Icon: LucideIcon;
}[] = [
  { id: "workspaces", Icon: Layers },
  { id: "apps", Icon: LayoutGrid },
  { id: "chats", Icon: MessageSquare },
  { id: "automations", Icon: Zap },
];

const RAIL_BTN =
  "inline-flex h-10 w-10 items-center justify-center rounded-[12px] text-muted-foreground transition-colors duration-200 hover:bg-black/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/10 dark:hover:bg-white/[0.08] dark:focus-visible:ring-white/20";

/** Active primary-rail icon — shell-select blue glyph, no gray wash. */
const RAIL_BTN_ACTIVE =
  "text-[var(--shell-select)] hover:bg-transparent hover:text-[var(--shell-select)] dark:hover:bg-transparent";

/**
 * Narrow primary icon rail (~56px) — brand mark, product sections, then
 * Search / Voice / account utilities. Panel collapse stays in the titlebar.
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
    openHelp,
    openNotifications,
    openSearch,
    openVoice,
    entitlements,
    view,
  } = useApp();

  return (
    <aside
      className={cn(
        "flex h-full w-[56px] shrink-0 flex-col items-center pb-2 pt-1.5",
        className,
      )}
      aria-label="Primary navigation"
    >
      {/*
        Match ContextualNavHeader (h-10) so Workspaces sits beside the first
        submenu row — brand mark fills that alignment slot at icon size.
      */}
      <div
        className="flex h-10 w-full shrink-0 items-center justify-center"
        aria-hidden
      >
        <CanderMark className="!h-[18px] !w-[18px]" />
      </div>
      <div className="flex flex-col items-center gap-1" role="tablist">
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
              className={cn(RAIL_BTN, active && RAIL_BTN_ACTIVE)}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </button>
          );
        })}
      </div>

      <div className="mt-auto flex flex-col items-center gap-1 pb-1">
        <button
          type="button"
          title="Search"
          aria-label="Search"
          data-desktop-no-drag=""
          onClick={() => openSearch()}
          className={cn(RAIL_BTN, view === "search" && RAIL_BTN_ACTIVE)}
        >
          <Search className="h-[17px] w-[17px]" strokeWidth={1.75} />
        </button>
        {entitlements.hasVoice ? (
          <button
            type="button"
            title="Voice"
            aria-label="Voice"
            data-desktop-no-drag=""
            onClick={() => openVoice()}
            className={cn(RAIL_BTN, view === "voice" && RAIL_BTN_ACTIVE)}
          >
            <VoiceWaveIcon size={15} />
          </button>
        ) : null}
        <button
          type="button"
          title="Notifications"
          aria-label="Notifications"
          data-desktop-no-drag=""
          onClick={() => openNotifications()}
          className={cn(RAIL_BTN, view === "notifications" && RAIL_BTN_ACTIVE)}
        >
          <Bell className="h-[17px] w-[17px]" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          title="Help"
          aria-label="Help"
          data-desktop-no-drag=""
          onClick={() => openHelp()}
          className={cn(RAIL_BTN, view === "help" && RAIL_BTN_ACTIVE)}
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
            (section === "general" || view === "settings") && RAIL_BTN_ACTIVE,
          )}
        >
          <CircleUser className="h-[17px] w-[17px]" strokeWidth={1.75} />
        </button>
      </div>
    </aside>
  );
}
