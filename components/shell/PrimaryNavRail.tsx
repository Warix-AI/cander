"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useApp } from "@/components/app/AppProvider";
import {
  IconApps,
  IconChats,
  IconGeneral,
  IconImages,
  IconNewChat,
  IconNotifications,
  IconPlus,
  IconWorkspaces,
  NAV_ICON_HEADER,
  NAV_ICON_RAIL,
  type NavIconComponent,
} from "@/components/brand/NavIcons";
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
  Icon: NavIconComponent;
}[] = [
  { id: "workspaces", Icon: IconWorkspaces },
  { id: "apps", Icon: IconApps },
  { id: "chats", Icon: IconChats },
  { id: "images", Icon: IconImages },
];

const HOVER_PLUS_MS = 1000;

const RAIL_BTN_BASE =
  "inline-flex h-10 w-10 items-center justify-center rounded-[12px] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/10 dark:focus-visible:ring-white/20";

const RAIL_BTN_IDLE =
  "text-muted-foreground hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.08]";

/** Active: blue glyph; light-gray hover wash (no conflicting muted text class). */
const RAIL_BTN_ACTIVE =
  "shell-rail-icon-active hover:bg-black/[0.05] dark:hover:bg-white/[0.08]";

const LABELED_BTN_BASE = cn(
  SIDEBAR_ROW,
  "h-10 gap-2.5 px-2.5 text-[13.5px] font-medium transition-colors duration-150",
);

const LABELED_BTN_IDLE = cn(
  SIDEBAR_ROW_HOVER,
  "text-muted-foreground",
);

const LABELED_BTN_ACTIVE = cn(
  "shell-rail-icon-active",
  "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
);

/**
 * Primary nav rail — icon-only (56px) or labeled tabs (~180px).
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
          ? "w-[180px] items-stretch px-1.5"
          : "w-[56px] items-center",
        className,
      )}
      aria-label="Primary navigation"
    >
      <div
        className={cn(
          "flex h-10 w-full shrink-0 items-center",
          labeled ? "justify-stretch" : "justify-center",
        )}
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
          <IconNewChat size={labeled ? NAV_ICON_HEADER : NAV_ICON_RAIL} />
          {labeled ? (
            <span className="min-w-0 truncate">New chat</span>
          ) : null}
        </button>
      </div>
      <div
        className={cn(
          "flex flex-col gap-1",
          labeled ? "items-stretch" : "items-center",
        )}
        role="tablist"
      >
        {PRIMARY.map(({ id, Icon }) => (
          <RailSectionButton
            key={id}
            id={id}
            Icon={Icon}
            labeled={labeled}
            active={section === id}
            onSelect={() => onSection(id)}
            onAdd={onAddSection ? () => onAddSection(id) : undefined}
          />
        ))}
      </div>

      <div
        className={cn(
          "mt-auto flex flex-col gap-1 pb-1",
          labeled ? "items-stretch" : "items-center",
        )}
      >
        <UtilityButton
          labeled={labeled}
          title="Notifications"
          active={view === "notifications"}
          onClick={() => openNotifications()}
        >
          <IconNotifications
            size={labeled ? NAV_ICON_HEADER : NAV_ICON_RAIL}
          />
        </UtilityButton>
        <UtilityButton
          labeled={labeled}
          title="General"
          active={section === "general" || view === "settings"}
          onClick={() => onSection("general")}
        >
          <IconGeneral size={labeled ? NAV_ICON_HEADER : NAV_ICON_RAIL} />
        </UtilityButton>
      </div>
    </aside>
  );
}

function RailSectionButton({
  id,
  Icon,
  labeled,
  active,
  onSelect,
  onAdd,
}: {
  id: Exclude<PrimaryNavSection, "general">;
  Icon: NavIconComponent;
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

  const isImages = id === "images";
  /** Images: blue translucent squircle instead of the gray wash. */
  const imagesHoverPad =
    isImages && !showPlus
      ? "relative overflow-visible hover:bg-transparent dark:hover:bg-transparent"
      : null;

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
        if (onAdd) {
          clearTimer();
          timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            setShowPlus(true);
          }, HOVER_PLUS_MS);
        }
      }}
      className={cn(
        "group",
        labeled ? LABELED_BTN_BASE : RAIL_BTN_BASE,
        active
          ? labeled
            ? LABELED_BTN_ACTIVE
            : RAIL_BTN_ACTIVE
          : labeled
            ? LABELED_BTN_IDLE
            : RAIL_BTN_IDLE,
        imagesHoverPad,
      )}
    >
      {isImages && !showPlus ? (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[10px] opacity-0 transition-opacity duration-200 ease-out",
            "bg-[linear-gradient(180deg,rgba(48,110,230,0.58)_0%,rgba(72,148,255,0.4)_100%)]",
            "shadow-[0_0_12px_rgba(64,136,255,0.4)] ring-1 ring-white/25",
            /* Slightly larger than the glyph — extends past underside + L/R */
            "h-[30px] w-[30px] group-hover:opacity-100",
          )}
        />
      ) : null}
      <span className={cn(isImages && !showPlus && "relative z-[1]")}>
        {showPlus ? (
          <IconPlus size={labeled ? NAV_ICON_HEADER : NAV_ICON_RAIL} />
        ) : (
          <Icon size={labeled ? NAV_ICON_HEADER : NAV_ICON_RAIL} />
        )}
      </span>
      {labeled ? (
        <span className="relative z-[1] min-w-0 truncate">{label}</span>
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
