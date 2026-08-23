"use client";

import { useState } from "react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { PinControl } from "@/components/shell/PinControl";
import { PanelChrome } from "@/components/panels/PanelChrome";
import { GmailNav } from "@/components/panels/gmail/GmailNav";
import { ComposePage } from "@/components/panels/gmail/pages/ComposePage";
import { FiltersPage } from "@/components/panels/gmail/pages/FiltersPage";
import { InboxPage } from "@/components/panels/gmail/pages/InboxPage";
import { LabelsPage } from "@/components/panels/gmail/pages/LabelsPage";
import { ToolsPage } from "@/components/panels/gmail/pages/ToolsPage";
import type { GmailNavId } from "@/lib/gmail";

export function GmailPanel() {
  const [page, setPage] = useState<GmailNavId>("inbox");

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <PanelChrome
        title="Gmail"
        leading={<ConnectorMark id="gmail" size="xs" />}
        trailing={
          <PinControl kind="connector" id="gmail" alwaysVisible className="[&_button]:h-7 [&_button]:w-7" />
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
