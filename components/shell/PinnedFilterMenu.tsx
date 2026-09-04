"use client";

import { Check, ListFilter } from "lucide-react";
import { Dropdown } from "@/components/ui/Controls";
import {
  PIN_KIND_LABEL,
  PIN_KIND_ORDER,
  usePinDisplayPrefs,
  type PinDisplayPrefs,
} from "@/lib/pin-display-prefs";
import type { PinKind } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PinnedFilterMenu({
  className,
}: {
  className?: string;
}) {
  const { prefs, setOrganize, toggleVisible, moveKind } = usePinDisplayPrefs();

  return (
    <Dropdown
      className={className}
      placement="bottom"
      align="end"
      matchTrigger={false}
      menuClassName="!w-[13.5rem] !p-1"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          aria-label="Filter pinned"
          aria-expanded={open}
          onClick={(event) => {
            event.stopPropagation();
            toggle();
          }}
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-opacity duration-150 hover:bg-sidebar-accent hover:text-foreground",
            open
              ? "opacity-100"
              : "opacity-0 group-hover/pins:opacity-100 group-focus-within/pins:opacity-100",
          )}
        >
          <ListFilter className="h-3.5 w-3.5" strokeWidth={1.8} />
        </button>
      )}
    >
      {() => (
        <div className="flex flex-col gap-px">
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium tracking-[0.02em] text-muted-foreground">
            Show
          </p>
          {PIN_KIND_ORDER.map((kind) => (
            <FilterRow
              key={kind}
              label={PIN_KIND_LABEL[kind]}
              active={prefs.visible.includes(kind)}
              onClick={() => toggleVisible(kind)}
            />
          ))}

          <div className="my-1 border-t border-border/50" />

          <p className="px-2.5 pt-0.5 pb-1 text-[11px] font-medium tracking-[0.02em] text-muted-foreground">
            Order
          </p>
          <FilterRow
            label="Session order"
            active={prefs.organize === "session"}
            onClick={() => setOrganize("session")}
          />
          <FilterRow
            label="Group by type"
            active={prefs.organize === "grouped"}
            onClick={() => setOrganize("grouped")}
          />

          {prefs.organize === "grouped" ? (
            <>
              <div className="my-1 border-t border-border/50" />
              <p className="px-2.5 pt-0.5 pb-1 text-[11px] font-medium tracking-[0.02em] text-muted-foreground">
                Show first
              </p>
              {prefs.order.map((kind) => (
                <KindOrderRow
                  key={kind}
                  kind={kind}
                  prefs={prefs}
                  onMove={moveKind}
                />
              ))}
            </>
          ) : null}
        </div>
      )}
    </Dropdown>
  );
}

function FilterRow({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-[13px] transition-colors duration-200 hover:bg-sidebar-accent",
        active && "font-medium",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-foreground" strokeWidth={2} />
      ) : (
        <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
      )}
    </button>
  );
}

function KindOrderRow({
  kind,
  prefs,
  onMove,
}: {
  kind: PinKind;
  prefs: PinDisplayPrefs;
  onMove: (kind: PinKind, dir: -1 | 1) => void;
}) {
  const index = prefs.order.indexOf(kind);
  return (
    <div className="flex items-center gap-1 rounded-[8px] px-1.5 py-0.5 hover:bg-sidebar-accent">
      <span className="min-w-0 flex-1 truncate px-1 text-[13px]">
        {PIN_KIND_LABEL[kind]}
      </span>
      <button
        type="button"
        aria-label={`Move ${PIN_KIND_LABEL[kind]} up`}
        disabled={index <= 0}
        onClick={() => onMove(kind, -1)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30"
      >
        ↑
      </button>
      <button
        type="button"
        aria-label={`Move ${PIN_KIND_LABEL[kind]} down`}
        disabled={index >= prefs.order.length - 1}
        onClick={() => onMove(kind, 1)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30"
      >
        ↓
      </button>
    </div>
  );
}
