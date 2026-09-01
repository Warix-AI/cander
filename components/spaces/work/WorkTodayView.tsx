"use client";

import {
  WORK_FOCUS_NOW,
  WORK_ON_DECK,
  type WorkTodayItem,
} from "@/lib/work-screen-data";
import { cn } from "@/lib/utils";

export function WorkTodayView() {
  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-[12px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
          Focus now
        </h3>
        <ul className="mt-3 divide-y divide-border/70 rounded-[10px] border border-border bg-card/40">
          {WORK_FOCUS_NOW.map((item) => (
            <TodayRow key={item.id} item={item} emphasis />
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-[12px] font-medium tracking-[0.04em] text-muted-foreground/80 uppercase">
          On deck
        </h3>
        <ul className="mt-3 divide-y divide-border/50 rounded-[10px] border border-border/60 bg-muted/10">
          {WORK_ON_DECK.map((item) => (
            <TodayRow key={item.id} item={item} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function TodayRow({
  item,
  emphasis = false,
}: {
  item: WorkTodayItem;
  emphasis?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-4 py-3.5",
        emphasis ? "py-4" : "py-3 opacity-90",
      )}
    >
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate tracking-[-0.02em] text-foreground",
            emphasis ? "text-[14px] font-medium" : "text-[13.5px] font-medium",
          )}
        >
          {item.title}
        </p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{item.source}</p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium tracking-[-0.01em]",
          emphasis
            ? "bg-muted text-foreground"
            : "text-muted-foreground",
        )}
        aria-hidden
      >
        {item.action}
      </span>
    </li>
  );
}
