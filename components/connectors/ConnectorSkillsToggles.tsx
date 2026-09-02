"use client";

import { useEffect, useMemo, useState } from "react";
import { Box, X } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { SettingsSwitch } from "@/components/settings/SettingsChrome";
import { Modal } from "@/components/ui/Modal";
import { updateConnectorToolPermissions } from "@/lib/api/connector-client";
import {
  toolsForConnector,
  type ConnectorToolDefinition,
} from "@/lib/connectors/tool-catalog";
import type { ConnectorConnection } from "@/lib/connectors/types";
import { cn } from "@/lib/utils";

export function ConnectorSkillsToggles({
  workspaceId,
  connection,
  disabled = false,
  disabledHint,
  onUpdated,
  className,
}: {
  workspaceId: string;
  connection: ConnectorConnection;
  disabled?: boolean;
  disabledHint?: string;
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

  if (!tools.length) return null;

  return (
    <div className={className}>
      {error ? (
        <p className="mb-2 text-[12px] text-destructive">{error}</p>
      ) : null}
      {disabled && disabledHint ? (
        <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
          {disabledHint}
        </p>
      ) : null}
      <div className="divide-y divide-border/70 rounded-[10px] border border-border/70">
        {tools.map((tool) => {
          const checked = Boolean(permissions[tool.id]);
          return (
            <div
              key={tool.id}
              className="flex items-start justify-between gap-3 px-3 py-3"
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-muted/80 text-muted-foreground">
                  <Box className="h-3.5 w-3.5" strokeWidth={1.6} />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium tracking-[-0.01em]">
                    {tool.label}
                  </p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                    {tool.description}
                  </p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/80">
                    {tool.access}
                  </p>
                </div>
              </div>
              <SettingsSwitch
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
