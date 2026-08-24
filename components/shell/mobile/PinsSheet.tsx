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
    return <ConnectorMark id={item.icon ?? "connector"} size="nav" />;
  }
  const Icon =
    (item.spaceId && spaceIcons[item.spaceId]) ||
    (item.kind === "project" ? FolderKanban : MessageSquare);
  return (
    <Icon
      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
      strokeWidth={2}
    />
  );
}

function PinSection({
  title,
  items,
  isActive,
  onOpen,
}: {
  title: string;
  items: PinnedItem[];
  isActive: (item: PinnedItem) => boolean;
  onOpen: (item: PinnedItem) => void;
}) {
  return (
    <section className="px-2 pb-2">
      <p className="px-3 pb-1 pt-2 text-[12px] font-medium text-muted-foreground">
        {title}
      </p>
      {items.length ? (
        items.map((item) => (
          <button
            key={`${item.kind}-${item.id}`}
            type="button"
            onClick={() => onOpen(item)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[13.5px] transition-colors duration-200",
              isActive(item) ? "bg-muted font-medium" : "hover:bg-muted",
            )}
          >
            <PinLeading item={item} />
            <span className="truncate">{item.title}</span>
          </button>
        ))
      ) : (
        <p className="px-3 py-1.5 text-[12px] text-muted-foreground/70">
          No {title.toLowerCase()} pins
        </p>
      )}
    </section>
  );
}

export function PinsSheet({ onSelect }: { onSelect: () => void }) {
  const {
    threadId,
    projectId,
    connectorId,
    spaceId,
    openThread,
    openProject,
    openConnector,
  } = useApp();
  const { primaryItems, secondaryItems } = usePinnedItems();

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
    <div className="py-1">
      <PinSection
        title="Primary"
        items={primaryItems}
        isActive={isActive}
        onOpen={openItem}
      />
      <PinSection
        title="Secondary"
        items={secondaryItems}
        isActive={isActive}
        onOpen={openItem}
      />
    </div>
  );
}
