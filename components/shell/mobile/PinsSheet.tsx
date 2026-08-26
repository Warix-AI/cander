"use client";

import { FolderKanban, MessageSquare } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { SettingsGroup } from "@/components/settings/SettingsChrome";
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
      {hideHeading ? null : (
        <p className="mb-2 px-1 text-[12px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
          Pinned
        </p>
      )}
      <SettingsGroup dividerInset="icon">
        {pinnedItems.length ? (
          pinnedItems.map((item) => (
            <button
              key={`${item.kind}-${item.id}`}
              type="button"
              data-active={isActive(item) ? "true" : undefined}
              onClick={() => openItem(item)}
              className={cn(
                "flex w-full items-center gap-3.5 px-4 py-3.5 text-left text-[16px] transition-colors duration-200 hover:bg-muted/50",
                isActive(item) && "bg-muted/70 font-medium",
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
      </SettingsGroup>
    </div>
  );
}
