"use client";

import { X } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { ConnectorSkillsToggles } from "@/components/connectors/ConnectorSkillsToggles";
import { Modal } from "@/components/ui/Modal";
import { toolsForConnector } from "@/lib/connectors/tool-catalog";
import type { ConnectorConnection } from "@/lib/connectors/types";
import type { Connector, PinTier } from "@/lib/types";
import { cn } from "@/lib/utils";

const CONNECTOR_PROMPTS: Record<string, string[]> = {
  gmail: [
    "Search my inbox for unread emails from this week.",
    "Send a quick reply to the latest admissions thread.",
  ],
};

export function ConnectorDetailModal({
  open,
  onClose,
  item,
  workspaceId,
  blocked,
  busy,
  tier,
  workAttach,
  onConnect,
  onDisconnect,
  onConnectionsRefresh,
  onSetPin,
  onClearPin,
}: {
  open: boolean;
  onClose: () => void;
  item: Connector & {
    pending?: boolean;
    installed?: boolean;
    liveConnections?: ConnectorConnection[];
  };
  workspaceId: string;
  blocked: boolean;
  busy: boolean;
  tier: PinTier | null;
  workAttach?: boolean;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  onConnectionsRefresh: () => void;
  onSetPin: () => void;
  onClearPin: () => void;
}) {
  const activeConnection = item.liveConnections?.find(
    (row) => row.status === "active",
  );
  const pendingConnection = item.liveConnections?.find(
    (row) => row.status === "pending",
  );
  const hasLiveConnection = Boolean(item.liveConnections?.length);
  const isConnected = Boolean(activeConnection);
  const skills = toolsForConnector(item.id);
  const prompts = CONNECTOR_PROMPTS[item.id] ?? [];
  const canManageServerConnection = item.id === "gmail";

  const statusLabel = blocked
    ? "Blocked"
    : isConnected
      ? "Connected"
      : pendingConnection
        ? "Connecting"
        : item.installed
          ? "Installed"
          : "Not connected";

  const statusTone = blocked
    ? "text-destructive"
    : isConnected
      ? "text-emerald-600 dark:text-emerald-400"
      : pendingConnection
        ? "text-chart-3"
        : "text-muted-foreground";

  const primaryLabel = blocked
    ? "Unavailable"
    : workAttach
      ? "Add to Work"
      : isConnected
        ? "Connected"
        : pendingConnection
          ? "Continue connecting"
          : canManageServerConnection
            ? "Connect"
            : "Install";

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy={`connector-detail-${item.id}`}
      className="flex w-[min(34rem,calc(100vw-2rem))] flex-col"
      backdropClassName="bg-black/60"
    >
      <div className="min-h-0 overflow-y-auto">
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div className="flex min-w-0 items-start gap-3">
            <ConnectorMark id={item.icon} size="md" className="shrink-0" />
            <div className="min-w-0">
              <h2
                id={`connector-detail-${item.id}`}
                className="text-[18px] font-semibold tracking-[-0.03em]"
              >
                {item.name}
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.6} />
          </button>
        </div>

        {prompts.length ? (
          <div className="mx-5 mt-4 overflow-hidden rounded-[10px] border border-border/70 bg-gradient-to-br from-sky-500/10 via-violet-500/10 to-transparent p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Try asking
            </p>
            <div className="mt-2 space-y-2">
              {prompts.map((prompt) => (
                <p
                  key={prompt}
                  className="rounded-[8px] bg-background/70 px-3 py-2 text-[12.5px] leading-relaxed text-foreground/90"
                >
                  {prompt}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-5 px-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Apps {hasLiveConnection || item.installed ? "1" : "0"}
            </p>
            <span className={cn("text-[12px] font-medium", statusTone)}>
              {statusLabel}
            </span>
          </div>
          {(isConnected || pendingConnection || item.installed) && !blocked ? (
            <div className="mt-2 flex items-center gap-2.5 rounded-[10px] border border-border/70 px-3 py-2.5">
              <ConnectorMark id={item.icon} size="xs" />
              <div className="min-w-0">
                <p className="text-[13px] font-medium">{item.name}</p>
                <p className="text-[12px] text-muted-foreground">
                  {pendingConnection
                    ? "Finish authorization to activate."
                    : isConnected
                      ? "Active in this workspace."
                      : "Installed locally."}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[13px] text-muted-foreground">
              Connect {item.name} to let Cander use it when you ask.
            </p>
          )}
        </div>

        {skills.length ? (
          <div className="mt-5 px-5 pb-2">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Skills {skills.length}
            </p>
            {activeConnection ? (
              <ConnectorSkillsToggles
                workspaceId={workspaceId}
                connection={activeConnection}
                onUpdated={() => onConnectionsRefresh()}
              />
            ) : (
              <ConnectorSkillsToggles
                workspaceId={workspaceId}
                connection={{
                  id: "preview",
                  workspaceId,
                  connectorId: item.id,
                  status: "pending",
                  connectionMode: "personal",
                  failureDetail: null,
                  toolPermissions: Object.fromEntries(
                    skills.map((tool) => [tool.id, tool.defaultEnabled]),
                  ),
                  createdAt: "",
                  updatedAt: "",
                  connectedAt: null,
                  disconnectedAt: null,
                  pendingExpiresAt: null,
                }}
                disabled
                disabledHint={
                  canManageServerConnection
                    ? "Connect this app to enable read and write skills for Cander."
                    : "Install this connector to configure skills when support is available."
                }
              />
            )}
          </div>
        ) : null}

        <div className="mt-5 border-t border-border/70 px-5 py-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
            Information
          </p>
          <dl className="mt-2 space-y-2 text-[13px]">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Category</dt>
              <dd>{item.category}</dd>
            </div>
            {item.actions?.length ? (
              <div>
                <dt className="text-muted-foreground">Capabilities</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {item.actions.map((action) => (
                    <span
                      key={action}
                      className="rounded-full border border-border/70 px-2 py-0.5 text-[11px]"
                    >
                      {action}
                    </span>
                  ))}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {isConnected && tier ? (
            <button
              type="button"
              onClick={onClearPin}
              className="inline-flex h-10 items-center rounded-full border border-border px-4 text-[13px] font-medium tracking-[-0.01em] hover:bg-muted"
            >
              Unpin
            </button>
          ) : isConnected ? (
            <button
              type="button"
              onClick={onSetPin}
              className="inline-flex h-10 items-center rounded-full border border-border px-4 text-[13px] font-medium tracking-[-0.01em] hover:bg-muted"
            >
              Pin
            </button>
          ) : null}
          {(isConnected || pendingConnection || hasLiveConnection || item.installed) &&
          !blocked ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onDisconnect()}
              className="inline-flex h-10 items-center rounded-full border border-destructive/30 px-4 text-[13px] font-medium tracking-[-0.01em] text-destructive hover:bg-destructive/5 disabled:opacity-50"
            >
              {busy
                ? "Disconnecting…"
                : canManageServerConnection
                  ? "Disconnect"
                  : "Uninstall"}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          disabled={blocked || busy || (isConnected && !workAttach && !pendingConnection)}
          onClick={() => void onConnect()}
          className="inline-flex h-10 items-center rounded-full bg-foreground px-5 text-[13px] font-medium tracking-[-0.01em] text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Working…" : primaryLabel}
        </button>
      </div>
    </Modal>
  );
}
