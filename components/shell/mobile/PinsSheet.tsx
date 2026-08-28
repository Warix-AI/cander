"use client";

import { FolderKanban, MessageSquare } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { useApp } from "@/components/app/AppProvider";
import {
  MOBILE_MENU_ICON_SIZE,
  MOBILE_MENU_ICON_STROKE,
  mobileMenuRowActiveClass,
  mobileMenuRowClass,
} from "@/lib/mobile-menu-styles";
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
    return <ConnectorMark id={item.icon ?? "connector"} size="xs" />;
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

  return (
    <div className="space-y-px">
      {hideHeading ? null : (
        <p className="mb-2 px-1 text-[12px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
          Pinned
        </p>
      )}
      {pinnedItems.length ? (
        pinnedItems.map((item) => (
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
      ) : (
        <p className="px-4 py-4 text-[13.5px] text-muted-foreground/70">
          No pinned items
        </p>
      )}
    </div>
  );
}
