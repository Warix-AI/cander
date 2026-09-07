"use client";

import { useEffect, useMemo } from "react";
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
  onSelect: (options?: { landOnPanel?: boolean }) => void;
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
  const { isCollapsed, toggle: togglePinSection, open: openPinSection } =
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
    } else {
      openProject(item.id, { landOnPanel: true });
    }
    // A pin represents the item itself, so open it at its destination panel.
    // The chat remains immediately available with the normal left swipe.
    onSelect({ landOnPanel: true });
  };

  const isActive = (item: PinnedItem) => {
    if (item.kind === "thread") return threadId === item.id;
    if (item.kind === "connector") {
      return connectorId === item.id && spaceId === "connectors";
    }
    return projectId === item.id;
  };

  const activePinKey =
    connectorId && spaceId === "connectors"
      ? `connector:${connectorId}`
      : projectId
        ? `project:${projectId}`
        : threadId
          ? `thread:${threadId}`
          : null;

  // Only when the active destination changes — don't re-lock the accordion
  // while the user browses other pin folders (Images, Searches, …).
  useEffect(() => {
    if (!activePinKey) return;
    const owning = pinGroups.find((group) =>
      group.items.some((item) => `${item.kind}:${item.id}` === activePinKey),
    );
    if (owning) openPinSection(owning.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pinGroups read on nav change only
  }, [activePinKey, openPinSection]);

  if (!pinGroups.length) {
    return (
      <>
        {!hideHeading ? (
          <div className="mb-2 flex items-center gap-1 px-1">
            <p className="min-w-0 flex-1 text-[12px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
              Pinned
            </p>
          </div>
        ) : null}
        <PinnedEmptyHint rowClassName={mobileMenuRowClass} />
      </>
    );
  }

  return (
    <>
      {pinGroups.map((group) => {
        const collapsed = isCollapsed(group.id);
        const SectionIcon = PIN_SECTION_ICONS[group.id];
        const activeChild = group.items.find((item) => isActive(item));
        // Highlight only when this section owns the current view — not when merely open.
        const sectionActive = Boolean(activeChild);
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
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#0b4fc4]"
                    />
                  ) : null}
                </button>
              );
            })}
          </PinSectionFolder>
        );
      })}
    </>
  );
}
