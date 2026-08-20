"use client";

import { useState } from "react";
import type { HandshakeNavId } from "@/lib/handshake";
import { HandshakeAssistant } from "@/components/panels/handshake/HandshakeAssistant";
import { HandshakeHeader } from "@/components/panels/handshake/HandshakeHeader";
import { HandshakeNav } from "@/components/panels/handshake/HandshakeNav";
import { ActivityPage } from "@/components/panels/handshake/pages/ActivityPage";
import { AgentsPage } from "@/components/panels/handshake/pages/AgentsPage";
import { AnalyticsPage } from "@/components/panels/handshake/pages/AnalyticsPage";
import { CapabilitiesPage } from "@/components/panels/handshake/pages/CapabilitiesPage";
import { ContextPage } from "@/components/panels/handshake/pages/ContextPage";
import { OverviewPage } from "@/components/panels/handshake/pages/OverviewPage";
import { PermissionsPage } from "@/components/panels/handshake/pages/PermissionsPage";

export function HandshakePanel() {
  const [page, setPage] = useState<HandshakeNavId>("overview");

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <HandshakeHeader onNavigate={setPage} />
      <HandshakeNav active={page} onChange={setPage} />
      <div className="min-h-0 flex-1 overflow-y-auto bg-background transition-opacity duration-200">
        {page === "overview" ? <OverviewPage /> : null}
        {page === "agents" ? <AgentsPage /> : null}
        {page === "capabilities" ? <CapabilitiesPage /> : null}
        {page === "permissions" ? <PermissionsPage /> : null}
        {page === "context" ? <ContextPage /> : null}
        {page === "activity" ? <ActivityPage /> : null}
        {page === "analytics" ? <AnalyticsPage /> : null}
      </div>
      <HandshakeAssistant />
    </div>
  );
}
