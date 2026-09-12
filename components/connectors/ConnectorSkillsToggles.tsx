"use client";

import { useEffect, useMemo, useState } from "react";
import { Box } from "lucide-react";
import { ConnectorSwitch } from "@/components/connectors/ConnectorSwitch";
import { updateConnectorToolPermissions } from "@/lib/api/connector-client";
import {
  toolsForConnector,
  type ConnectorToolDefinition,
} from "@/lib/connectors/tool-catalog";
import type { ConnectorConnection } from "@/lib/connectors/types";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

export function ConnectorSkillsToggles({
  workspaceId,
  connection,
  disabled = false,
  onUpdated,
  className,
}: {
  workspaceId: string;
  connection: ConnectorConnection;
  disabled?: boolean;
  onUpdated?: (connection: ConnectorConnection) => void;
  className?: string;
}) {
  const [permissions, setPermissions] = useState(connection.toolPermissions);
  const [savingToolId, setSavingToolId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const tools = useMemo(
    () => toolsForConnector(connection.connectorId),
    [connection.connectorId],
  );

  useEffect(() => {
    setPermissions(connection.toolPermissions);
  }, [connection.id, connection.toolPermissions]);

  const toggleTool = async (tool: ConnectorToolDefinition, enabled: boolean) => {
    if (disabled) return;
    setError("");
    setSavingToolId(tool.id);
    const previous = permissions;
    const optimistic = { ...permissions, [tool.id]: enabled };
    setPermissions(optimistic);

    try {
      const updated = await updateConnectorToolPermissions({
        workspaceId,
        connectionId: connection.id,
        permissions: { [tool.id]: enabled },
      });
      setPermissions(updated.toolPermissions);
      onUpdated?.(updated);
    } catch (err) {
      setPermissions(previous);
      setError(
        err instanceof Error ? err.message : "Could not update permissions.",
      );
    } finally {
      setSavingToolId(null);
    }
  };

  if (!tools.length) {
    return (
      <div
        className={cn(
          "flex items-center justify-center px-4 py-8 text-center text-[13px] text-muted-foreground",
          SHELL_G3_RADIUS,
          "bg-white/45 shadow-[0_12px_32px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:bg-white/[0.06] dark:shadow-[0_12px_32px_rgba(0,0,0,0.16)]",
          className,
        )}
      >
        Skills for this connector are coming soon.
      </div>
    );
  }

  return (
    <div className={className}>
      {error ? (
        <p className="mb-2 text-[12px] text-destructive">{error}</p>
      ) : null}
      <div
        className={cn(
          "space-y-1 overflow-hidden bg-white/45 p-2.5 shadow-[0_12px_32px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:bg-white/[0.06] dark:shadow-[0_12px_32px_rgba(0,0,0,0.16)]",
          SHELL_G3_RADIUS,
        )}
      >
        {tools.map((tool) => {
          const checked = Boolean(permissions[tool.id]);
          return (
            <div
              key={tool.id}
              className={cn(
                "flex items-center justify-between gap-3 px-3 py-3 transition-colors hover:bg-black/[0.06] dark:hover:bg-white/[0.08]",
                SHELL_G3_RADIUS,
              )}
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <span
                  className={cn(
                    "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center bg-muted/80 text-muted-foreground",
                    SHELL_G3_RADIUS,
                  )}
                >
                  <Box className="h-3.5 w-3.5" strokeWidth={1.6} />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium tracking-[-0.01em]">
                    {tool.label}
                  </p>
                  <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                    {tool.description}
                  </p>
                </div>
              </div>
              <ConnectorSwitch
                checked={checked}
                disabled={disabled || savingToolId === tool.id}
                label={tool.label}
                onChange={(next) => void toggleTool(tool, next)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
