"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ImageIcon, Layers, Plus, SquarePen, type LucideIcon } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import {
  IconChats,
  IconGeneral,
  IconNotifications,
  IconWorkspaces,
  SHELL_ICON_CLASS,
  SHELL_ICON_PX,
  type NavIconComponent,
} from "@/components/brand/NavIcons";
import {
  PRIMARY_NAV_LABEL,
  PRIMARY_NAV_RAIL_ICON_WIDTH_PX,
  PRIMARY_NAV_RAIL_LABELED_WIDTH_PX,
  type PrimaryNavSection,
} from "@/lib/nav-primary";
import {
  SIDEBAR_ROW,
  SIDEBAR_ROW_HOVER,
} from "@/lib/mobile-menu-styles";
import { cn } from "@/lib/utils";

type RailIcon = LucideIcon | NavIconComponent;

const PRIMARY: {
  id: Exclude<PrimaryNavSection, "general">;
  Icon: RailIcon;
  /** Stock Lucide glyph (vs custom rounded set). */
  lucide?: boolean;
}[] = [
  { id: "workspaces", Icon: IconWorkspaces },
  { id: "apps", Icon: Layers, lucide: true },
  { id: "chats", Icon: IconChats },
  { id: "images", Icon: ImageIcon, lucide: true },
];

const HOVER_PLUS_MS = 1000;

/** Match Apps sidebar row rhythm (py-2 + gap-0.5), not the taller h-10 dock. */
const RAIL_BTN_BASE =
  "inline-flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/10 dark:focus-visible:ring-white/20";

const RAIL_BTN_IDLE =
  "text-muted-foreground hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.08]";

/** Active: blue glyph; light-gray hover wash (no conflicting muted text class). */
const RAIL_BTN_ACTIVE =
  "shell-rail-icon-active hover:bg-black/[0.05] dark:hover:bg-white/[0.08]";

const LABELED_BTN_BASE = cn(
  SIDEBAR_ROW,
  "gap-2.5 px-2.5 text-[13.5px] font-medium transition-colors duration-150",
);

const LABELED_BTN_IDLE = cn(
  SIDEBAR_ROW_HOVER,
  "text-muted-foreground",
);

const LABELED_BTN_ACTIVE = cn(
  "shell-rail-icon-active",
  "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
);

const RAIL_STACK = "flex flex-col gap-0.5";

/**
 * Primary nav rail — icon-only or labeled tabs.
 * Selected section icons turn blue; after a sustained hover they morph to
 * a plus that opens the section’s add flow.
 */
export function PrimaryNavRail({
  section,
  onSection,
  onAddSection,
  className,
}: {
  section: PrimaryNavSection;
  onSection: (next: PrimaryNavSection) => void;
  onAddSection?: (next: Exclude<PrimaryNavSection, "general">) => void;
  className?: string;
}) {
  const {
    openNotifications,
    newChat,
    view,
    primaryNavRailMode,
  } = useApp();

  const labeled = primaryNavRailMode === "labeled";

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col pb-2 pt-1.5",
        labeled
          ? "items-stretch px-1.5"
          : "items-center",
        className,
      )}
      style={{
        width: labeled
          ? PRIMARY_NAV_RAIL_LABELED_WIDTH_PX
          : PRIMARY_NAV_RAIL_ICON_WIDTH_PX,
      }}
      aria-label="Primary navigation"
    >
      <div
        className={cn(
          RAIL_STACK,
          labeled ? "items-stretch" : "items-center",
        )}
        role="tablist"
      >
        <button
          type="button"
          title="New chat"
          aria-label="New chat"
          data-desktop-no-drag=""
          onClick={() => {
            onSection("chats");
            newChat();
          }}
          className={cn(
            labeled ? LABELED_BTN_BASE : RAIL_BTN_BASE,
            labeled && "w-full",
            labeled ? LABELED_BTN_IDLE : RAIL_BTN_IDLE,
          )}
        >
          <SquarePen
            className={cn("shrink-0", labeled ? "h-4 w-4" : SHELL_ICON_CLASS)}
            strokeWidth={1.75}
          />
          {labeled ? (
            <span className="min-w-0 truncate">New chat</span>
          ) : null}
        </button>
        {PRIMARY.map(({ id, Icon, lucide }) => (
          <RailSectionButton
            key={id}
            id={id}
            Icon={Icon}
            lucide={lucide}
            labeled={labeled}
            active={section === id}
            onSelect={() => onSection(id)}
            onAdd={onAddSection ? () => onAddSection(id) : undefined}
          />
        ))}
      </div>

      <div
        className={cn(
          "mt-auto pb-1",
          RAIL_STACK,
          labeled ? "items-stretch" : "items-center",
        )}
      >
        <UtilityButton
          labeled={labeled}
          title="Notifications"
          active={view === "notifications"}
          onClick={() => openNotifications()}
        >
          <IconNotifications size={labeled ? 16 : SHELL_ICON_PX} />
        </UtilityButton>
        <UtilityButton
          labeled={labeled}
          title="General"
          active={section === "general" || view === "settings"}
          onClick={() => onSection("general")}
        >
          <IconGeneral size={labeled ? 16 : SHELL_ICON_PX} />
        </UtilityButton>
      </div>
    </aside>
  );
}

function RailSectionButton({
  id,
  Icon,
  lucide,
  labeled,
  active,
  onSelect,
  onAdd,
}: {
  id: Exclude<PrimaryNavSection, "general">;
  Icon: RailIcon;
  lucide?: boolean;
  labeled: boolean;
  active: boolean;
  onSelect: () => void;
  onAdd?: () => void;
}) {
  const [showPlus, setShowPlus] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetPlus = useCallback(() => {
    clearTimer();
    setShowPlus(false);
  }, [clearTimer]);

  useEffect(() => {
    if (!active) resetPlus();
  }, [active, resetPlus]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const onPointerEnter = () => {
    if (!active || !onAdd) return;
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setShowPlus(true);
    }, HOVER_PLUS_MS);
  };

  const onPointerLeave = () => {
    resetPlus();
  };

  const label = showPlus
    ? PRIMARY_NAV_ADD_LABEL[id]
    : PRIMARY_NAV_LABEL[id];

  return (
    <button
      type="button"
      role="tab"
      title={label}
      aria-label={label}
      aria-selected={active}
      aria-current={active ? "page" : undefined}
      data-desktop-no-drag=""
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onClick={() => {
        if (showPlus && onAdd) {
          onAdd();
          resetPlus();
          return;
        }
        onSelect();
        // Keep hover-plus arming if the pointer stays after selecting.
        if (onAdd) {
          clearTimer();
          timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            setShowPlus(true);
          }, HOVER_PLUS_MS);
        }
      }}
      className={cn(
        labeled ? LABELED_BTN_BASE : RAIL_BTN_BASE,
        active
          ? labeled
            ? LABELED_BTN_ACTIVE
            : RAIL_BTN_ACTIVE
          : labeled
            ? LABELED_BTN_IDLE
            : RAIL_BTN_IDLE,
      )}
    >
      {showPlus ? (
        <Plus
          className={cn("shrink-0", labeled ? "h-4 w-4" : SHELL_ICON_CLASS)}
          strokeWidth={1.75}
        />
      ) : lucide ? (
        <Icon
          className={cn("shrink-0", labeled ? "h-4 w-4" : SHELL_ICON_CLASS)}
          strokeWidth={1.75}
        />
      ) : (
        <Icon size={labeled ? 16 : SHELL_ICON_PX} className="shrink-0" />
      )}
      {labeled ? (
        <span className="min-w-0 truncate">{label}</span>
      ) : null}
    </button>
  );
}

export const PRIMARY_NAV_ADD_LABEL: Record<
  Exclude<PrimaryNavSection, "general">,
  string
> = {
  workspaces: "Add workspace",
  apps: "Add app",
  chats: "New chat",
  images: "New image",
};

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
        labeled ? LABELED_BTN_BASE : RAIL_BTN_BASE,
        active
          ? labeled
            ? LABELED_BTN_ACTIVE
            : RAIL_BTN_ACTIVE
          : labeled
            ? LABELED_BTN_IDLE
            : RAIL_BTN_IDLE,
      )}
    >
      {children}
      {labeled ? <span className="min-w-0 truncate">{title}</span> : null}
    </button>
  );
}
