"use client";

import { ConnectorSkillsToggles } from "@/components/connectors/ConnectorSkillsToggles";
import type { ConnectorConnection } from "@/lib/connectors/types";
import { cn } from "@/lib/utils";

export function ConnectorToolPermissions({
  workspaceId,
  connection,
  onUpdated,
  className,
}: {
  workspaceId: string;
  connection: ConnectorConnection;
  onUpdated?: (connection: ConnectorConnection) => void;
  className?: string;
}) {
  return (
    <div className={cn("px-3", className)}>
      <p className="pb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        AI access
      </p>
      <ConnectorSkillsToggles
        workspaceId={workspaceId}
        connection={connection}
        onUpdated={onUpdated}
      />
    </div>
  );
}
