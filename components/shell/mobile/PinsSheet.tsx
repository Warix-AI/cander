"use client";

import { useMemo } from "react";
import { ChevronDown, FolderKanban, MessageSquare } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { useApp } from "@/components/app/AppProvider";
import { PinnedFilterMenu } from "@/components/shell/PinnedFilterMenu";
import {
  MOBILE_MENU_ICON_SIZE,
  MOBILE_MENU_ICON_STROKE,
  mobileMenuRowActiveClass,
  mobileMenuRowClass,
} from "@/lib/mobile-menu-styles";
import {
  groupPinnedItemsByKind,
  PIN_KIND_LABEL,
  usePinDisplayPrefs,
  usePinSectionCollapse,
} from "@/lib/pin-display-prefs";
import { usePinnedItems, type PinnedItem } from "@/lib/use-pinned-items";
import { spaceIcons } from "@/lib/space-icons";
import type { SpaceId } from "@/lib/types";
import { cn } from "@/lib/utils";

function PinLeading({
  item,
}: {
  item: Pick<PinnedItem, "kind" | "icon" | "spaceId">;
}) {
  if (item.kind === "connector") {
    return <ConnectorMark id={item.icon ?? "connector"} size="nav" />;
  }
  const Icon =
    (item.spaceId && spaceIcons[item.spaceId as SpaceId]) ||
    (item.kind === "project" ? FolderKanban : MessageSquare);
  return (
    <Icon
      className={cn(MOBILE_MENU_ICON_SIZE, "shrink-0 text-muted-foreground")}
      strokeWidth={MOBILE_MENU_ICON_STROKE}
    />
  );
}

export function PinsSheet({
  onSelect,
  hideHeading = false,
}: {
  onSelect: () => void;
  hideHeading?: boolean;
}) {
  const {
    threadId,
    projectId,
    connectorId,
    spaceId,
    openThread,
    openProject,
    openConnector,
  } = useApp();
  const { pinnedItems } = usePinnedItems();
  const { prefs: pinPrefs } = usePinDisplayPrefs();
  const { isCollapsed, toggle: togglePinSection } = usePinSectionCollapse();

  const pinGroups = useMemo(
    () => groupPinnedItemsByKind(pinnedItems, pinPrefs),
    [pinnedItems, pinPrefs],
  );

  const openItem = (item: PinnedItem) => {
    if (item.kind === "thread") openThread(item.id);
    else if (item.kind === "connector") openConnector(item.id);
    else openProject(item.id);
    onSelect();
  };

  const isActive = (item: PinnedItem) => {
    if (item.kind === "thread") return threadId === item.id;
    if (item.kind === "connector") {
      return connectorId === item.id && spaceId === "connectors";
    }
    return projectId === item.id;
  };

  if (!pinGroups.length && hideHeading) return null;

  return (
    <div className="space-y-3">
      {!hideHeading && pinGroups.length === 0 ? (
        <div className="group/pins mb-2 flex items-center gap-1 px-1">
          <p className="min-w-0 flex-1 text-[12px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
            Pinned
          </p>
        </div>
      ) : null}
      {pinGroups.map((group, index) => {
        const collapsed = isCollapsed(group.kind);
        return (
          <div key={group.kind} className="space-y-px">
            <div className="group/pins mb-1 flex items-center gap-1 px-1">
              <button
                type="button"
                onClick={() => togglePinSection(group.kind)}
                aria-expanded={!collapsed}
                className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-2 py-1.5 text-left text-[12px] font-medium tracking-[0.04em] text-muted-foreground uppercase transition-colors hover:bg-black/[0.03] hover:text-foreground dark:hover:bg-white/8"
              >
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 normal-case transition-transform duration-200",
                    collapsed && "-rotate-90",
                  )}
                  strokeWidth={2}
                />
                <span className="min-w-0 flex-1 truncate normal-case tracking-[-0.01em]">
                  {PIN_KIND_LABEL[group.kind]}
                </span>
              </button>
              {index === 0 ? <PinnedFilterMenu /> : null}
            </div>
            {!collapsed
              ? group.items.map((item) => (
                  <button
                    key={`${item.kind}-${item.id}`}
                    type="button"
                    onClick={() => openItem(item)}
                    className={cn(
                      mobileMenuRowClass,
                      isActive(item) && mobileMenuRowActiveClass,
                    )}
                  >
                    <PinLeading item={item} />
                    <span className="truncate">{item.title}</span>
                  </button>
                ))
              : null}
          </div>
        );
      })}
    </div>
  );
}
