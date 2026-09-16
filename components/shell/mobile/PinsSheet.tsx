"use client";

import { useEffect, useMemo, useState } from "react";
import { AppsMoreSection } from "@/components/shell/AppsMoreSection";
import { ExpertsMoreSection } from "@/components/shell/ExpertsMoreSection";
import { PinPreviewThumb } from "@/components/shell/PinPreviewThumb";
import { PinSectionFolder } from "@/components/shell/PinSectionFolder";
import { PinSectionSearch } from "@/components/shell/PinSectionSearch";
import { PinnedEmptyHint } from "@/components/shell/PinnedEmptyHint";
import { useApp } from "@/components/app/AppProvider";
import {
  PRIMARY_NAV_CARD_ACTIVE,
  PRIMARY_NAV_CARD_HOVER,
  mobileMenuRowActiveClass,
  mobileMenuRowClass,
  MOBILE_MENU_ICON_SIZE,
  MOBILE_MENU_ICON_STROKE,
} from "@/lib/mobile-menu-styles";
import {
  usePinDisplayPrefs,
  usePinSectionCollapse,
} from "@/lib/pin-display-prefs";
import {
  ensurePrimaryPinSections,
  groupPinnedItemsBySection,
  PIN_SECTION_ICONS,
  PIN_SECTION_LABEL,
  type PinSectionId,
} from "@/lib/pin-sections";
import { setAppsMoreOpen } from "@/lib/apps-more-prefs";
import { usePinnedItems, type PinnedItem } from "@/lib/use-pinned-items";
import {
  skipMobilePagerTransitionOnce,
  skipMobileSpaceEnterOnce,
} from "@/lib/mobile-nav-transition";
import { cn } from "@/lib/utils";

export function PinsSheet({
  onSelect,
  hideHeading = false,
  sectionIds,
  cardSurface = false,
  headerOnly = false,
  bodyOnly = false,
}: {
  onSelect: (options?: { landOnPanel?: boolean }) => void;
  hideHeading?: boolean;
  /** Limit to these pin folders (e.g. primary Apps + Chats). */
  sectionIds?: PinSectionId[];
  /** Match New-card hover/active when nested in the primary inset. */
  cardSurface?: boolean;
  /** Headers only — bodies render elsewhere under the fixed card. */
  headerOnly?: boolean;
  /** Bodies only — flat list under the New / Apps / Chats card. */
  bodyOnly?: boolean;
}) {
  const {
    threadId,
    projectId,
    connectorId,
    spaceId,
    openThread,
    openProject,
    openConnector,
    openConnectorConnect,
    setPin,
    openExpertSetup,
    newChat,
  } = useApp();
  const { pinnedItems } = usePinnedItems();
  const { prefs: pinPrefs } = usePinDisplayPrefs();
  const { isCollapsed, toggle: togglePinSection, open: openPinSection } =
    usePinSectionCollapse();

  const pinGroups = useMemo(() => {
    const grouped = ensurePrimaryPinSections(
      groupPinnedItemsBySection(pinnedItems, {
        visibleKinds: pinPrefs.visible,
      }),
    );
    if (!sectionIds?.length) return grouped;
    const allow = new Set(sectionIds);
    return grouped.filter((group) => allow.has(group.id));
  }, [pinnedItems, pinPrefs, sectionIds]);

  const openItem = (item: PinnedItem) => {
    if (item.kind === "thread") openThread(item.id);
    else if (item.kind === "connector") openConnector(item.id);
    else if (item.expertCatalog) {
      openExpertSetup(item.id);
    } else if (item.projectKind === "automation") {
      openProject(item.id, {
        agentSurface: "overview",
        landOnPanel: true,
      });
    } else {
      openProject(item.id, { landOnPanel: true });
    }
    onSelect({ landOnPanel: true });
  };

  const connectFromMore = (id: string) => {
    openConnectorConnect(id);
    onSelect({ landOnPanel: true });
  };

  const addExpertFromMore = (id: string) => {
    setPin("project", id, "primary");
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

  useEffect(() => {
    if (!activePinKey) return;
    const owning = pinGroups.find((group) =>
      group.items.some((item) => `${item.kind}:${item.id}` === activePinKey),
    );
    if (!owning || owning.id === "chats") return;
    openPinSection(owning.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pinGroups read on nav change only
  }, [activePinKey, openPinSection]);

  const onToggleSection = (
    groupId: PinSectionId,
    collapsed: boolean,
    ownsView: boolean,
  ) => {
    const closing = !collapsed;
    togglePinSection(groupId);
    if (groupId === "connectors" && closing) {
      setAppsMoreOpen(false);
    }
    if (closing && ownsView) {
      skipMobilePagerTransitionOnce();
      skipMobileSpaceEnterOnce();
      window.setTimeout(() => {
        newChat();
      }, 200);
    }
  };

  if (!pinGroups.length) {
    if (sectionIds?.length) return null;
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

  if (headerOnly) {
    return (
      <>
        {pinGroups.map((group) => {
          const collapsed = isCollapsed(group.id);
          const SectionIcon = PIN_SECTION_ICONS[group.id];
          const activeChild = group.items.find((item) => isActive(item));
          const lit = Boolean(activeChild) || !collapsed;
          return (
            <button
              key={`${group.id}-card`}
              type="button"
              aria-expanded={!collapsed}
              onClick={() =>
                onToggleSection(group.id, collapsed, Boolean(activeChild))
              }
              className={cn(
                mobileMenuRowClass,
                cardSurface ? "rounded-none" : null,
                cardSurface
                  ? lit
                    ? PRIMARY_NAV_CARD_ACTIVE
                    : PRIMARY_NAV_CARD_HOVER
                  : lit
                    ? mobileMenuRowActiveClass
                    : null,
              )}
            >
              <SectionIcon
                className={cn(
                  MOBILE_MENU_ICON_SIZE,
                  "shrink-0 text-muted-foreground",
                )}
                strokeWidth={MOBILE_MENU_ICON_STROKE}
              />
              <span className="min-w-0 flex-1 truncate">
                {PIN_SECTION_LABEL[group.id]}
              </span>
            </button>
          );
        })}
      </>
    );
  }

  return (
    <>
      {pinGroups.map((group) => {
        const collapsed = isCollapsed(group.id);
        const SectionIcon = PIN_SECTION_ICONS[group.id];
        const activeChild = group.items.find((item) => isActive(item));
        const sectionActive = Boolean(activeChild);
        const treeActiveKey = activeChild
          ? `${activeChild.kind}:${activeChild.id}`
          : null;
        return (
          <PinSectionFolder
            key={`${group.id}${bodyOnly ? "-b" : ""}`}
            label={PIN_SECTION_LABEL[group.id]}
            icon={SectionIcon}
            expanded={!collapsed}
            sectionActive={sectionActive}
            onToggle={() =>
              onToggleSection(group.id, collapsed, Boolean(activeChild))
            }
            activeKey={treeActiveKey}
            deps={group.items.map((item) => `${item.kind}:${item.id}`).join(",")}
            bodyOnly={bodyOnly}
            flat={bodyOnly || !cardSurface}
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
            <MobilePinSectionBody
              group={group}
              isActive={isActive}
              openItem={openItem}
              connectFromMore={connectFromMore}
              addExpertFromMore={addExpertFromMore}
            />
          </PinSectionFolder>
        );
      })}
    </>
  );
}

function MobilePinSectionBody({
  group,
  isActive,
  openItem,
  connectFromMore,
  addExpertFromMore,
}: {
  group: { id: PinSectionId; items: PinnedItem[] };
  isActive: (item: PinnedItem) => boolean;
  openItem: (item: PinnedItem) => void;
  connectFromMore: (id: string) => void;
  addExpertFromMore: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const items = needle
    ? group.items.filter((item) => item.title.toLowerCase().includes(needle))
    : group.items;

  return (
    <>
      <PinSectionSearch
        value={query}
        onChange={setQuery}
        padClassName=""
        className={cn(mobileMenuRowClass, "text-muted-foreground")}
      />
      {items.map((item) => {
        const inUse = isActive(item);
        const hideLeading = item.kind === "thread";
        return (
          <button
            key={`${item.kind}-${item.id}`}
            type="button"
            data-pin-tree-key={`${item.kind}:${item.id}`}
            title={
              item.expertKind ? `${item.expertKind} expert` : undefined
            }
            onClick={() => openItem(item)}
            className={cn(
              mobileMenuRowClass,
              "group relative",
              inUse && mobileMenuRowActiveClass,
            )}
          >
            {hideLeading ? null : (
              <span
                data-pin-leading
                className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center overflow-visible"
              >
                <PinPreviewThumb item={item} />
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-left">
              {item.title}
            </span>
          </button>
        );
      })}
      {group.id === "connectors" ? (
        <AppsMoreSection
          listedIds={group.items.map((item) => item.id)}
          onConnect={connectFromMore}
          query={query}
        />
      ) : null}
      {group.id === "agents" ? (
        <ExpertsMoreSection
          listedIds={group.items.map((item) => item.id)}
          onAdd={addExpertFromMore}
          query={query}
        />
      ) : null}
    </>
  );
}
