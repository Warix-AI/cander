"use client";

import type { ReactNode } from "react";
import { MobilePager } from "@/components/shell/MobilePager";
import type { MobileSurface } from "@/lib/types";

/** Horizontal pager for chat · panel on mobile (menu is handled by MobileMenuScaffold). */
export function MobileContentPager({
  chatPane,
  panelPane,
  withPanel,
  active,
}: {
  chatPane: ReactNode;
  panelPane?: ReactNode;
  withPanel: boolean;
  active: MobileSurface;
}) {
  const body =
    !withPanel || !panelPane ? (
      chatPane
    ) : (
      <MobilePager panes={["chat", "panel"]} active={active === "panel" ? "panel" : "chat"}>
        {[chatPane, panelPane]}
      </MobilePager>
    );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {body}
    </div>
  );
}
