"use client";

import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { DefaultChatPreviewWash } from "@/components/spaces/BannerWash";
import type { PinnedItem } from "@/lib/use-pinned-items";
import { cn } from "@/lib/utils";

/** Leading mark for a pinned row — connector brand, expert icon, or project cover. */
export function PinPreviewThumb({
  item,
  className,
}: {
  item: Pick<
    PinnedItem,
    "kind" | "icon" | "coverImage" | "coverGradient" | "expertCatalog"
  >;
  className?: string;
}) {
  if (item.kind === "connector") {
    return <ConnectorMark id={item.icon ?? "connector"} size="nav" />;
  }

  // Chats: name only — no leading glyph.
  if (item.kind === "thread") {
    return null;
  }

  if (item.expertCatalog || (item.coverImage && item.icon?.startsWith("/experts/"))) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.coverImage ?? item.icon ?? "/experts/expert-icon.png"}
        alt=""
        draggable={false}
        className={cn(
          "h-4 w-4 shrink-0 rounded-[4px] object-cover object-center",
          className,
        )}
      />
    );
  }

  return (
    <span
      className={cn(
        "relative h-4 w-4 shrink-0 overflow-hidden rounded-[3px]",
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
