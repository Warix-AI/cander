"use client";

import type { ReactNode } from "react";
import {
  Bell,
  CircleHelp,
  CircleUser,
  ImageIcon,
  Layers,
  LayoutGrid,
  MessageSquare,
  Search,
  type LucideIcon,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { CanderMark } from "@/components/brand/CanderMark";
import { VoiceWaveIcon } from "@/components/shell/VoiceOrb";
import {
  PRIMARY_NAV_LABEL,
  type PrimaryNavSection,
} from "@/lib/nav-primary";
import {
  SIDEBAR_ROW,
  SIDEBAR_ROW_HOVER,
} from "@/lib/mobile-menu-styles";
import { cn } from "@/lib/utils";

const PRIMARY: {
  id: Exclude<PrimaryNavSection, "general">;
  Icon: LucideIcon;
}[] = [
  { id: "workspaces", Icon: Layers },
  { id: "apps", Icon: LayoutGrid },
  { id: "chats", Icon: MessageSquare },
  { id: "images", Icon: ImageIcon },
];

const RAIL_BTN =
  "inline-flex h-10 w-10 items-center justify-center rounded-[12px] text-muted-foreground transition-colors duration-200 hover:bg-black/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/10 dark:hover:bg-white/[0.08] dark:focus-visible:ring-white/20";

/** Active primary-rail icon — shell-select blue glyph, no gray wash. */
const RAIL_BTN_ACTIVE =
  "text-[var(--shell-select)] hover:bg-transparent hover:text-[var(--shell-select)] dark:hover:bg-transparent";

const LABELED_BTN = cn(
  SIDEBAR_ROW,
  SIDEBAR_ROW_HOVER,
  "h-10 gap-2.5 px-2.5 text-[13.5px] font-medium text-muted-foreground",
);

const LABELED_BTN_ACTIVE = "shell-nav-row-active text-[var(--shell-select-foreground)]";

/**
 * Primary nav rail — icon-only (56px) or labeled tabs (~180px) for the
 * wide dual-menu mode. Search / Voice / account utilities sit at the bottom.
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
    primaryNavRailMode,
  } = useApp();

  const labeled = primaryNavRailMode === "labeled";

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col pb-2 pt-1.5",
        labeled
          ? "w-[180px] items-stretch px-1.5"
          : "w-[56px] items-center",
        className,
      )}
      aria-label="Primary navigation"
    >
      {/*
        Match ContextualNavHeader (h-10) so Workspaces sits beside the first
        submenu row — brand mark fills that alignment slot at icon size.
      */}
      <div
        className={cn(
          "flex h-10 w-full shrink-0 items-center",
          labeled ? "justify-start px-2.5" : "justify-center",
        )}
        aria-hidden
      >
        <CanderMark className="!h-[18px] !w-[18px]" />
      </div>
      <div
        className={cn(
          "flex flex-col gap-1",
          labeled ? "items-stretch" : "items-center",
        )}
        role="tablist"
      >
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
                labeled
                  ? cn(LABELED_BTN, active && LABELED_BTN_ACTIVE)
                  : cn(RAIL_BTN, active && RAIL_BTN_ACTIVE),
              )}
            >
              <Icon
                className={cn(
                  "shrink-0",
                  labeled ? "h-4 w-4" : "h-[18px] w-[18px]",
                )}
                strokeWidth={1.75}
              />
              {labeled ? (
                <span className="min-w-0 truncate">{PRIMARY_NAV_LABEL[id]}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        className={cn(
          "mt-auto flex flex-col gap-1 pb-1",
          labeled ? "items-stretch" : "items-center",
        )}
      >
        <UtilityButton
          labeled={labeled}
          title="Search"
          active={view === "search"}
          onClick={() => openSearch()}
        >
          <Search
            className={labeled ? "h-4 w-4" : "h-[17px] w-[17px]"}
            strokeWidth={1.75}
          />
        </UtilityButton>
        {entitlements.hasVoice ? (
          <UtilityButton
            labeled={labeled}
            title="Voice"
            active={view === "voice"}
            onClick={() => openVoice()}
          >
            <VoiceWaveIcon size={labeled ? 14 : 15} />
          </UtilityButton>
        ) : null}
        <UtilityButton
          labeled={labeled}
          title="Notifications"
          active={view === "notifications"}
          onClick={() => openNotifications()}
        >
          <Bell
            className={labeled ? "h-4 w-4" : "h-[17px] w-[17px]"}
            strokeWidth={1.75}
          />
        </UtilityButton>
        <UtilityButton
          labeled={labeled}
          title="Help"
          active={view === "help"}
          onClick={() => openHelp()}
        >
          <CircleHelp
            className={labeled ? "h-4 w-4" : "h-[17px] w-[17px]"}
            strokeWidth={1.75}
          />
        </UtilityButton>
        <UtilityButton
          labeled={labeled}
          title="General"
          active={section === "general" || view === "settings"}
          onClick={() => onSection("general")}
        >
          <CircleUser
            className={labeled ? "h-4 w-4" : "h-[17px] w-[17px]"}
            strokeWidth={1.75}
          />
        </UtilityButton>
      </div>
    </aside>
  );
}

function UtilityButton({
  labeled,
  title,
  active,
  onClick,
  children,
}: {
  labeled: boolean;
  title: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      data-desktop-no-drag=""
      onClick={onClick}
      className={cn(
        labeled
          ? cn(LABELED_BTN, active && LABELED_BTN_ACTIVE)
          : cn(RAIL_BTN, active && RAIL_BTN_ACTIVE),
      )}
    >
      {children}
      {labeled ? <span className="min-w-0 truncate">{title}</span> : null}
    </button>
  );
}
