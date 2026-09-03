"use client";

import type { ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { PanelToggle } from "@/components/shell/PanelToggle";
import { useMobileShell } from "@/lib/use-media-query";
import {
  BROWSER_CHROME_BG,
  BROWSER_CHROME_CHIP_HOVER,
} from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

export function PanelChrome({
  title,
  kicker,
  leading,
  trailing,
  integrated = true,
}: {
  title: string;
  kicker?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Panel toggle merged into this row (default). */
  integrated?: boolean;
}) {
  const { panelMode, setPanelMode } = useApp();
  const mobile = useMobileShell();

  return (
    <div
      className={cn(
        "flex min-w-0 shrink-0 items-center gap-1",
        "h-11 px-3",
        BROWSER_CHROME_BG,
        mobile && "pr-3",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 px-0.5">
        {leading}
        <div className="min-w-0">
          {kicker && !integrated ? (
            <p className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
              {kicker}
            </p>
          ) : null}
          <p className="truncate text-[12px] font-medium tracking-[-0.01em]">
            {title}
          </p>
        </div>
      </div>
      <span className="ml-auto flex shrink-0 items-center gap-0.5">
        {trailing}
        {mobile ? null : (
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
        )}
        {integrated && !mobile ? <PanelToggle /> : null}
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
        "inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground",
        BROWSER_CHROME_CHIP_HOVER,
        "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
