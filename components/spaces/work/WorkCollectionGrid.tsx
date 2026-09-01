"use client";

import { Blocks, Ellipsis, FileText, Pin } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { DefaultChatPreviewWash } from "@/components/spaces/BannerWash";
import { editedMeta } from "@/lib/format-relative-time";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import type { WorkCollectionItem } from "@/lib/work-screen-data";
import type { SpaceLayout } from "@/lib/types";
import { cn } from "@/lib/utils";

const LIST_PREVIEW_FRAME = "h-11 w-[4.4rem]";
const CARD_PREVIEW_FRAME = "aspect-[16/9] w-full";

/** Card connector tile is 80px; list uses 40% of that for the mark only. */
const CARD_CONNECTOR_MARK = "!h-20 !w-20 [&_svg]:!h-10 [&_svg]:!w-10";
const LIST_CONNECTOR_MARK = "!h-8 !w-8 [&_svg]:!h-4 [&_svg]:!w-4";

function centeredConnectorClass(compact: boolean) {
  return cn(
    compact ? "rounded-[8px]" : SHELL_G3_RADIUS,
    "relative z-10",
    compact ? LIST_CONNECTOR_MARK : CARD_CONNECTOR_MARK,
  );
}

function WorkPreviewFace({
  item,
  compact = false,
}: {
  item: WorkCollectionItem;
  compact?: boolean;
}) {
  const frameClass = cn(
    "relative flex shrink-0 items-center justify-center overflow-hidden rounded-[10px]",
    compact ? LIST_PREVIEW_FRAME : CARD_PREVIEW_FRAME,
  );

  if (item.category === "connections" && item.connectorId) {
    return (
      <div className={frameClass}>
        <DefaultChatPreviewWash />
        <ConnectorMark
          id={item.connectorId}
          size={compact ? "sm" : "md"}
          className={centeredConnectorClass(compact)}
        />
      </div>
    );
  }

  if (item.category === "assets") {
    return (
      <div
        className={cn(
          frameClass,
          "border border-border bg-card",
        )}
      >
        <FileText
          className={cn(
            "relative z-10 text-muted-foreground",
            compact ? "h-4 w-4" : "h-5 w-5",
          )}
          strokeWidth={1.6}
        />
      </div>
    );
  }

  return (
    <div className={frameClass}>
      <DefaultChatPreviewWash />
    </div>
  );
}

function WorkRowActions() {
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        aria-label="Pin"
        disabled
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/45"
      >
        <Pin className="h-3.5 w-3.5" strokeWidth={1.6} />
      </button>
      <button
        type="button"
        aria-label="Add to space"
        disabled
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/45"
      >
        <Blocks className="h-3.5 w-3.5" strokeWidth={1.6} />
      </button>
      <button
        type="button"
        aria-label="More"
        disabled
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-canvas-hover hover:text-foreground"
      >
        <Ellipsis className="h-3.5 w-3.5" strokeWidth={1.6} />
      </button>
    </span>
  );
}

function WorkCollectionListRow({
  item,
  onOpen,
}: {
  item: WorkCollectionItem;
  onOpen?: (item: WorkCollectionItem) => void;
}) {
  const meta = editedMeta(item.addedAt);
  return (
    <div className="flex items-center gap-3 rounded-[10px] py-2.5 transition-colors duration-200">
      <button
        type="button"
        onClick={() => onOpen?.(item)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left transition-colors duration-200 hover:opacity-90"
      >
        <WorkPreviewFace item={item} compact />
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-medium tracking-[-0.02em]">
            {item.title}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
            {meta}
          </span>
        </span>
      </button>
      <WorkRowActions />
    </div>
  );
}

function WorkCollectionCard({
  item,
  onOpen,
}: {
  item: WorkCollectionItem;
  onOpen?: (item: WorkCollectionItem) => void;
}) {
  const meta = editedMeta(item.addedAt);
  const mark = item.title.trim().charAt(0).toUpperCase();

  return (
    <button
      type="button"
      onClick={() => onOpen?.(item)}
      className="flex h-full min-w-0 flex-col text-left transition-opacity duration-200 hover:opacity-90"
    >
      <WorkPreviewFace item={item} />
      <div className="mt-2.5 flex items-center gap-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium">
            {mark}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-medium tracking-[-0.02em]">
              {item.title}
            </span>
            <span className="block truncate text-[12px] text-muted-foreground">
              {meta}
            </span>
          </span>
        </div>
        <span
          className="shrink-0"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <WorkRowActions />
        </span>
      </div>
    </button>
  );
}

export function WorkCollectionGrid({
  layout,
  items,
  onOpen,
}: {
  layout: SpaceLayout;
  items: WorkCollectionItem[];
  onOpen?: (item: WorkCollectionItem) => void;
}) {
  if (!items.length) {
    return (
      <p className="py-4 text-[13px] text-muted-foreground">
        Nothing in this category yet.
      </p>
    );
  }

  if (layout === "list") {
    return (
      <div>
        {items.map((item) => (
          <WorkCollectionListRow key={item.id} item={item} onOpen={onOpen} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-x-3 gap-y-6 @min-[440px]:grid-cols-2 @min-[720px]:grid-cols-3">
      {items.map((item) => (
        <WorkCollectionCard key={item.id} item={item} onOpen={onOpen} />
      ))}
    </div>
  );
}
