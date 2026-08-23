"use client";

import { useState } from "react";
import { PinControl } from "@/components/shell/PinControl";
import { PanelChrome } from "@/components/panels/PanelChrome";
import type { HandshakeNavId } from "@/lib/handshake";
import { HandshakeNav } from "@/components/panels/handshake/HandshakeNav";
import { HandshakeIcon } from "@/components/panels/handshake/HandshakeIcon";
import { hs } from "@/components/panels/handshake/handshake-ui";
import { AgentsPage } from "@/components/panels/handshake/pages/AgentsPage";
import { CapabilitiesPage } from "@/components/panels/handshake/pages/CapabilitiesPage";
import { ConnectionsPage } from "@/components/panels/handshake/pages/ConnectionsPage";
import { ContextPage } from "@/components/panels/handshake/pages/ContextPage";
import { ConversationsPage } from "@/components/panels/handshake/pages/ConversationsPage";
import { OverviewPage } from "@/components/panels/handshake/pages/OverviewPage";
import { SecurityPage } from "@/components/panels/handshake/pages/SecurityPage";
import { SettingsPage } from "@/components/panels/handshake/pages/SettingsPage";
import { TransactionsPage } from "@/components/panels/handshake/pages/TransactionsPage";
import { cn } from "@/lib/utils";

export function HandshakePanel() {
  const [page, setPage] = useState<HandshakeNavId>("overview");

  return (
    <div className={cn("flex h-full min-h-0 flex-col", hs.panel)}>
      <PanelChrome
        title="Handshake"
        leading={<HandshakeIcon size="xs" />}
        trailing={
          <PinControl
            kind="connector"
            id="handshake"
            alwaysVisible
            className="[&_button]:h-7 [&_button]:w-7"
          />
        }
      />
      <HandshakeNav active={page} onChange={setPage} />
      <div className={cn("min-h-0 flex-1 overflow-y-auto", hs.panel)}>
        {page === "overview" ? <OverviewPage /> : null}
        {page === "agents" ? <AgentsPage /> : null}
        {page === "connections" ? <ConnectionsPage /> : null}
        {page === "capabilities" ? <CapabilitiesPage /> : null}
        {page === "context" ? <ContextPage /> : null}
        {page === "conversations" ? <ConversationsPage /> : null}
        {page === "transactions" ? <TransactionsPage /> : null}
        {page === "security" ? <SecurityPage /> : null}
        {page === "settings" ? <SettingsPage /> : null}
      </div>
    </div>
  );
}
