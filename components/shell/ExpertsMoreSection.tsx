"use client";

import { useMemo } from "react";
import {
  expertHoverLabel,
  listSidebarAvailableExperts,
  type ExpertCatalogEntry,
} from "@/lib/expert-catalog";
import { cn } from "@/lib/utils";

/**
 * Catalog experts not yet added. Hover a row to reveal Add — mirrors AppsMoreSection.
 * Added experts surface above via the pin list.
 */
export function ExpertsMoreSection({
  listedIds,
  onAdd,
  query = "",
}: {
  listedIds: Iterable<string>;
  onAdd: (expertId: string) => void;
  query?: string;
}) {
  const listedKey = useMemo(
    () => [...listedIds].sort().join(","),
    [listedIds],
  );

  const available = useMemo(
    () =>
      listSidebarAvailableExperts({
        listedIds: listedKey ? listedKey.split(",") : [],
      }),
    [listedKey],
  );

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? available.filter(
        (expert) =>
          expert.name.toLowerCase().includes(needle) ||
          expert.kind.toLowerCase().includes(needle),
      )
    : available;
  if (!matches.length) return null;

  return (
    <div className="relative mt-0.5 flex flex-col gap-0.5">
      {matches.map((expert) => (
        <AvailableExpertRow key={expert.id} expert={expert} onAdd={onAdd} />
      ))}
    </div>
  );
}

function AvailableExpertRow({
  expert,
  onAdd,
}: {
  expert: ExpertCatalogEntry;
  onAdd: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "group relative flex w-full items-center rounded-[8px] transition-colors duration-150",
        "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
      )}
    >
      <div
        title={expertHoverLabel(expert)}
        className="flex min-w-0 flex-1 items-center gap-2.5 truncate px-2.5 py-2 text-left text-[14px] tracking-[-0.01em]"
      >
        <span className="inline-flex h-4 w-4 shrink-0 overflow-hidden rounded-[4px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={expert.icon}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
          />
        </span>
        <span className="min-w-0 flex-1 truncate text-foreground/80">
          {expert.name}
        </span>
      </div>
      <button
        type="button"
        data-expert-add=""
        aria-label={`Add ${expert.name}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onAdd(expert.id);
        }}
        className={cn(
          "absolute right-1 top-1/2 z-[1] inline-flex h-6 -translate-y-1/2 items-center justify-center rounded-md px-2 text-[12px] font-medium tracking-[-0.01em]",
          "pointer-events-none opacity-0 transition-[opacity,background-color,color] duration-150",
          "group-hover:pointer-events-auto group-hover:opacity-100",
          "focus-visible:pointer-events-auto focus-visible:opacity-100",
          "text-muted-foreground",
          "hover:bg-[var(--shell-select)] hover:text-[var(--shell-select-foreground)]",
          "focus-visible:bg-[var(--shell-select)] focus-visible:text-[var(--shell-select-foreground)]",
        )}
      >
        Add
      </button>
    </div>
  );
}
