"use client";

import { FolderKanban, MessageSquare } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { useApp } from "@/components/app/AppProvider";
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
    return <ConnectorMark id={item.icon ?? "connector"} size="md" />;
  }
  const Icon =
    (item.spaceId && spaceIcons[item.spaceId]) ||
    (item.kind === "project" ? FolderKanban : MessageSquare);
  return (
    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-muted/70">
      <Icon
        className="h-5 w-5 text-muted-foreground"
        strokeWidth={1.9}
      />
    </span>
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
    return projectId === item.id && !threadId;
  };

  return (
    <div>
      <section>
        {hideHeading ? null : (
          <p className="px-3 pb-1 pt-2 text-[12px] font-medium text-muted-foreground">
            Pinned
          </p>
        )}
        {pinnedItems.length ? (
          pinnedItems.map((item) => (
            <button
              key={`${item.kind}-${item.id}`}
              type="button"
              data-active={isActive(item) ? "true" : undefined}
              onClick={() => openItem(item)}
              className={cn(
                "menu-row-hover flex w-full items-center gap-3.5 rounded-[12px] px-3 py-3 text-left text-[16px] transition-colors duration-200",
                isActive(item) && "bg-muted/70 font-medium",
              )}
            >
              <PinLeading item={item} />
              <span className="truncate">{item.title}</span>
            </button>
          ))
        ) : (
          <p className="px-3 py-2 text-[13px] text-muted-foreground/70">
            No pinned items
          </p>
        )}
      </section>
    </div>
  );
}
