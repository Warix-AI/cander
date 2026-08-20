"use client";

import { useState } from "react";
import { Pin } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { useApp } from "@/components/app/AppProvider";
import { PanelChrome } from "@/components/panels/PanelChrome";
import { GmailNav } from "@/components/panels/gmail/GmailNav";
import { ComposePage } from "@/components/panels/gmail/pages/ComposePage";
import { FiltersPage } from "@/components/panels/gmail/pages/FiltersPage";
import { InboxPage } from "@/components/panels/gmail/pages/InboxPage";
import { LabelsPage } from "@/components/panels/gmail/pages/LabelsPage";
import { ToolsPage } from "@/components/panels/gmail/pages/ToolsPage";
import type { GmailNavId } from "@/lib/gmail";
import { cn } from "@/lib/utils";

export function GmailPanel() {
  const { isPinned, togglePin } = useApp();
  const [page, setPage] = useState<GmailNavId>("inbox");
  const pinned = isPinned("connector", "gmail");

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <PanelChrome
        title="Gmail"
        leading={<ConnectorMark id="gmail" size="xs" />}
        trailing={
          <button
            type="button"
            title={pinned ? "Unpin" : "Pin to sidebar"}
            aria-label={pinned ? "Unpin" : "Pin to sidebar"}
            onClick={() => togglePin("connector", "gmail")}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              pinned && "text-foreground",
            )}
          >
            <Pin
              className={cn("h-3.5 w-3.5", pinned && "fill-current")}
              strokeWidth={1.6}
            />
          </button>
        }
      />
      <GmailNav active={page} onChange={setPage} />
      <div className="min-h-0 flex-1 overflow-y-auto bg-sidebar">
        {page === "inbox" ? <InboxPage /> : null}
        {page === "compose" ? <ComposePage /> : null}
        {page === "labels" ? <LabelsPage /> : null}
        {page === "filters" ? <FiltersPage /> : null}
        {page === "tools" ? <ToolsPage /> : null}
      </div>
    </div>
  );
}
