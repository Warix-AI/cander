"use client";

import { useState } from "react";
import { Check, ChevronDown, Circle, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Compact tool-activity row for in-app agent actions. */
export function ToolCallBlock({
  label,
  status,
  detail,
}: {
  label: string;
  status: "running" | "done" | "error";
  detail?: string;
}) {
  const [open, setOpen] = useState(false);
  const running = status === "running";
  const done = status === "done";

  return (
    <div className="my-1 max-w-full">
      <button
        type="button"
        onClick={() => detail && setOpen((v) => !v)}
        disabled={!detail}
        className={cn(
          "inline-flex max-w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[13px] tracking-[-0.01em]",
          detail ? "hover:bg-muted" : "cursor-default",
          running && "animate-pulse text-muted-foreground",
          done && "text-muted-foreground",
          status === "error" && "text-destructive",
        )}
      >
        {running ? (
          <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin" strokeWidth={1.6} />
        ) : done ? (
          <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
        ) : (
          <Circle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
        )}
        <span className="min-w-0 truncate">
          {running ? `${label}…` : done ? label : label}
        </span>
        {detail ? (
          <ChevronDown
            className={cn(
              "h-3 w-3 shrink-0 transition-transform",
              open && "rotate-180",
            )}
            strokeWidth={1.6}
          />
        ) : null}
      </button>
      {open && detail ? (
        <pre className="mt-1 overflow-x-auto rounded-[8px] bg-muted/50 px-2.5 py-2 font-mono text-[11.5px] leading-relaxed text-muted-foreground [scrollbar-width:thin]">
          {detail}
        </pre>
      ) : null}
    </div>
  );
}
