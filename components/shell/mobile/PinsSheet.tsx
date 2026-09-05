"use client";

import { useMemo } from "react";
import { PinPreviewThumb } from "@/components/shell/PinPreviewThumb";
import { PinSectionFolder } from "@/components/shell/PinSectionFolder";
import { PinnedEmptyHint } from "@/components/shell/PinnedEmptyHint";
import { useApp } from "@/components/app/AppProvider";
import {
  MOBILE_MENU_ICON_SIZE,
  MOBILE_MENU_ICON_STROKE,
  mobileMenuRowActiveClass,
  mobileMenuRowClass,
} from "@/lib/mobile-menu-styles";
import {
  usePinDisplayPrefs,
  usePinSectionCollapse,
} from "@/lib/pin-display-prefs";
import {
  groupPinnedItemsBySection,
  PIN_SECTION_ICONS,
  PIN_SECTION_LABEL,
} from "@/lib/pin-sections";
import { usePinnedItems, type PinnedItem } from "@/lib/use-pinned-items";
import { cn } from "@/lib/utils";

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
    newChat,
  } = useApp();
  const { pinnedItems } = usePinnedItems();
  const { prefs: pinPrefs } = usePinDisplayPrefs();
  const { isCollapsed, toggle: togglePinSection } =
    usePinSectionCollapse();

  const pinGroups = useMemo(
    () =>
      groupPinnedItemsBySection(pinnedItems, {
        visibleKinds: pinPrefs.visible,
      }),
    [pinnedItems, pinPrefs],
  );

  const openItem = (item: PinnedItem) => {
    if (item.kind === "thread") openThread(item.id);
    else if (item.kind === "connector") openConnector(item.id);
    else if (item.projectKind === "automation") {
      openProject(item.id, {
        agentSurface: "overview",
        landOnPanel: true,
      });
    } else openProject(item.id);
    onSelect();
  };

  const isActive = (item: PinnedItem) => {
    if (item.kind === "thread") return threadId === item.id;
    if (item.kind === "connector") {
      return connectorId === item.id && spaceId === "connectors";
    }
    return projectId === item.id;
  };

  if (!pinGroups.length) {
    return (
      <div className="space-y-1">
        {!hideHeading ? (
          <div className="mb-2 flex items-center gap-1 px-1">
            <p className="min-w-0 flex-1 text-[12px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
              Pinned
            </p>
          </div>
        ) : null}
        <PinnedEmptyHint rowClassName={mobileMenuRowClass} />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {pinGroups.map((group) => {
        const collapsed = isCollapsed(group.id);
        const SectionIcon = PIN_SECTION_ICONS[group.id];
        const activeChild = group.items.find((item) => isActive(item));
        const sectionActive = !collapsed || Boolean(activeChild);
        const treeActiveKey = activeChild
          ? `${activeChild.kind}:${activeChild.id}`
          : null;
        return (
          <PinSectionFolder
            key={group.id}
            label={PIN_SECTION_LABEL[group.id]}
            icon={SectionIcon}
            expanded={!collapsed}
            sectionActive={sectionActive}
            onToggle={() => {
              const closing = !collapsed;
              const ownsView = Boolean(activeChild);
              togglePinSection(group.id);
              if (closing && ownsView) newChat();
            }}
            activeKey={treeActiveKey}
            deps={group.items
              .map((item) => `${item.kind}:${item.id}`)
              .join(",")}
            headerClassName={cn(
              mobileMenuRowClass,
              sectionActive && mobileMenuRowActiveClass,
            )}
            iconClassName={cn(
              MOBILE_MENU_ICON_SIZE,
              "shrink-0 text-muted-foreground",
            )}
            iconStrokeWidth={MOBILE_MENU_ICON_STROKE}
          >
            {group.items.map((item) => {
              const inUse = isActive(item);
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  data-pin-tree-key={`${item.kind}:${item.id}`}
                  onClick={() => openItem(item)}
                  className={cn(
                    mobileMenuRowClass,
                    "group relative pl-1.5",
                    inUse && "font-medium",
                  )}
                >
                  <span data-pin-leading className="inline-flex shrink-0">
                    <PinPreviewThumb item={item} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left">
                    {item.title}
                  </span>
                  {inUse ? (
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-[oklch(0.62_0.19_260)]"
                    />
                  ) : null}
                </button>
              );
            })}
          </PinSectionFolder>
        );
      })}
    </div>
  );
}
