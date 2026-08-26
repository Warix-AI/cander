"use client";

import { PanelToggle } from "@/components/shell/PanelToggle";
import { useMobileShell } from "@/lib/use-media-query";

export function PanelEmptyState() {
  const mobile = useMobileShell();

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!mobile ? (
        <div className="flex h-11 shrink-0 items-center justify-end px-3">
          <PanelToggle />
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 text-center">
      <p className="text-[14px] font-medium tracking-[-0.02em]">
        Nothing here yet
      </p>
      <p className="mt-2 max-w-[16rem] text-[13px] leading-relaxed text-muted-foreground">
        Select a space, project, or thread and what you pick will show up in
        this panel.
      </p>
      </div>
    </div>
  );
}
