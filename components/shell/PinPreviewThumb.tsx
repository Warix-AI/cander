"use client";

import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { DefaultChatPreviewWash } from "@/components/spaces/BannerWash";
import type { PinnedItem } from "@/lib/use-pinned-items";
import { cn } from "@/lib/utils";

const CHAT_ORB_SRC = "/cander-orb.png?v=16";

/** Leading mark for a pinned row — connector brand, chat orb, or project cover. */
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

  if (item.kind === "thread") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={CHAT_ORB_SRC}
        alt=""
        draggable={false}
        className={cn(
          "h-3.5 w-3.5 shrink-0 rounded-full object-cover object-center",
          className,
        )}
      />
    );
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
