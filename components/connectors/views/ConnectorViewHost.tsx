"use client";

import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { GmailConnectorView } from "@/components/connectors/views/GmailConnectorView";
import { PanelChrome } from "@/components/panels/PanelChrome";
import { PinControl } from "@/components/shell/PinControl";
import { CONNECTOR_CATALOG } from "@/lib/api/connector-catalog";
import { SHELL_PANEL_BODY } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

/**
 * Right-panel host for connector views. Picks the provider UI by catalog id.
 */
export function ConnectorViewHost({ connectorId }: { connectorId: string }) {
  if (connectorId === "gmail") {
    return <GmailConnectorView />;
  }

  const catalog = CONNECTOR_CATALOG.find((item) => item.id === connectorId);
  const title = catalog?.name ?? connectorId;

  return (
    <div className={cn(SHELL_PANEL_BODY)}>
      <PanelChrome
        title={title}
        integrated
        leading={<ConnectorMark id={connectorId} size="xs" />}
        trailing={
          <PinControl
            kind="connector"
            id={connectorId}
            alwaysVisible
            className="[&_button]:h-7 [&_button]:w-7"
          />
        }
      />
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-[14px] font-medium text-foreground">
          Connector view coming soon
        </p>
        <p className="max-w-sm text-[12.5px] text-muted-foreground">
          {title} can be pinned and chat-scoped today. A native panel view for
          this connector is not available yet.
        </p>
      </div>
    </div>
  );
}
