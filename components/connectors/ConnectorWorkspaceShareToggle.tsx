"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { ConnectorSwitch } from "@/components/connectors/ConnectorSwitch";
import { Modal } from "@/components/ui/Modal";
import { updateConnectorWorkspaceShare } from "@/lib/api/connector-client";
import type { ConnectorConnection } from "@/lib/connectors/types";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

/**
 * Per-account workspace share control — Skills-style glass row.
 * Turning on requires an explicit disclaimer confirmation.
 */
export function ConnectorWorkspaceShareToggle({
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
  const [shared, setShared] = useState(
    connection.connectionMode === "workspace_shared",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setShared(connection.connectionMode === "workspace_shared");
  }, [connection.id, connection.connectionMode]);

  const applyShare = async (next: boolean) => {
    if (disabled) return;
    setError("");
    setSaving(true);
    const previous = shared;
    setShared(next);
    try {
      const updated = await updateConnectorWorkspaceShare({
        workspaceId,
        connectionId: connection.id,
        shared: next,
      });
      setShared(updated.connectionMode === "workspace_shared");
      onUpdated?.(updated);
    } catch (err) {
      setShared(previous);
      setError(
        err instanceof Error ? err.message : "Could not update sharing.",
      );
    } finally {
      setSaving(false);
    }
  };

  const onToggle = (next: boolean) => {
    if (disabled || saving) return;
    if (next) {
      setConfirmOpen(true);
      return;
    }
    void applyShare(false);
  };

  return (
    <div className={className}>
      {error ? (
        <p className="mb-2 text-[12px] text-destructive">{error}</p>
      ) : null}
      <div
        className={cn(
          "overflow-hidden bg-white/45 p-2.5 shadow-[0_12px_32px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:bg-white/[0.06] dark:shadow-[0_12px_32px_rgba(0,0,0,0.16)]",
          SHELL_G3_RADIUS,
        )}
      >
        <div
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
              <Users className="h-3.5 w-3.5" strokeWidth={1.6} />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium tracking-[-0.01em]">
                Share with workspace
              </p>
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                Let other members use this account.
              </p>
            </div>
          </div>
          <ConnectorSwitch
            checked={shared}
            disabled={disabled || saving}
            label="Share with workspace"
            onChange={onToggle}
          />
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        labelledBy={`share-confirm-${connection.id}`}
        className={cn("w-full max-w-sm p-4", SHELL_G3_RADIUS)}
        backdropClassName="bg-black/30"
        sheetOnMobile
      >
        <p
          id={`share-confirm-${connection.id}`}
          className="text-[15px] font-semibold tracking-[-0.02em]"
        >
          Share this account with the workspace?
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          Anyone in this workspace will be able to use “
          {connection.displayName}” for {connection.connectorId} — including
          reading and writing through Cander — even if they never signed in to
          that provider account themselves. Only turn this on if you trust every
          member of this workspace.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => setConfirmOpen(false)}
            className={cn(
              "inline-flex h-9 items-center px-3 text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-50",
              SHELL_G3_RADIUS,
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setConfirmOpen(false);
              void applyShare(true);
            }}
            className={cn(
              "inline-flex h-9 items-center bg-foreground px-4 text-[13px] font-medium text-background disabled:opacity-50",
              SHELL_G3_RADIUS,
            )}
          >
            {saving ? "Sharing…" : "Share account"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
