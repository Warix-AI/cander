"use client";

import type { ReactNode } from "react";
import { Maximize2, Minimize2, PanelRight } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { cn } from "@/lib/utils";

export function PanelChrome({
  title,
  kicker,
  trailing,
}: {
  title: string;
  kicker?: string;
  trailing?: ReactNode;
}) {
  const { panelMode, setPanelMode } = useApp();
  return (
    <div className="flex h-10 min-w-0 shrink-0 items-center gap-1 bg-sidebar px-2">
      <div className="min-w-0 px-1.5">
        {kicker ? (
          <p className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
            {kicker}
          </p>
        ) : null}
        <p className="truncate text-[12px] font-medium tracking-[-0.01em]">{title}</p>
      </div>
      <span className="ml-auto flex items-center gap-0.5">
        {trailing}
        <ChromeBtn
          label={panelMode === "immersive" ? "Exit full screen" : "Full screen"}
          onClick={() =>
            setPanelMode(panelMode === "immersive" ? "split" : "immersive")
          }
        >
          {panelMode === "immersive" ? (
            <Minimize2 className="h-3.5 w-3.5" strokeWidth={1.6} />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.6} />
          )}
        </ChromeBtn>
        <ChromeBtn label="Close panel" onClick={() => setPanelMode("collapsed")}>
          <PanelRight className="h-3.5 w-3.5" strokeWidth={1.6} />
        </ChromeBtn>
      </span>
    </div>
  );
}

function ChromeBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
