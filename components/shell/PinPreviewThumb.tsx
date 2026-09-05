"use client";

import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { DefaultChatPreviewWash } from "@/components/spaces/BannerWash";
import type { PinnedItem } from "@/lib/use-pinned-items";
import { cn } from "@/lib/utils";

/** Leading mark for a pinned row — connector brand, or live cover / gradient / wash. */
export function PinPreviewThumb({
  item,
  className,
}: {
  item: Pick<
    PinnedItem,
    "kind" | "icon" | "coverImage" | "coverGradient"
  >;
  className?: string;
}) {
  if (item.kind === "connector") {
    return <ConnectorMark id={item.icon ?? "connector"} size="nav" />;
  }

  return (
    <span
      className={cn(
        "relative h-3.5 w-3.5 shrink-0 overflow-hidden rounded-[3px]",
        className,
      )}
    >
      {item.coverImage ? (
        <img
          src={item.coverImage}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
      ) : item.coverGradient ? (
        <span className={cn("absolute inset-0", item.coverGradient)} />
      ) : (
        <DefaultChatPreviewWash />
      )}
    </span>
  );
}
