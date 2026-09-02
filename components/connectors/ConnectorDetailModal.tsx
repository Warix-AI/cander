"use client";

import { ArrowRight, X } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { ConnectorSkillsToggles } from "@/components/connectors/ConnectorSkillsToggles";
import { Modal } from "@/components/ui/Modal";
import { toolsForConnector } from "@/lib/connectors/tool-catalog";
import type { ConnectorConnection } from "@/lib/connectors/types";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import type { Connector, PinTier } from "@/lib/types";
import { cn } from "@/lib/utils";

type ConnectorPrompt = {
  text: string;
};

const CONNECTOR_PROMPTS: Record<string, ConnectorPrompt[]> = {
  gmail: [
    { text: "Search my inbox for unread emails from this week." },
    { text: "Send a quick reply to the latest admissions thread." },
  ],
  slack: [
    { text: "Search recent Slack messages about the launch." },
    { text: "Post a summary to the team channel." },
  ],
  github: [
    { text: "Find open pull requests assigned to me." },
    { text: "Summarize what changed in the repo this week." },
  ],
};

function promptsForConnector(item: Connector): ConnectorPrompt[] {
  if (CONNECTOR_PROMPTS[item.id]?.length) {
    return CONNECTOR_PROMPTS[item.id]!;
  }
  return [
    { text: `Search my recent ${item.name} activity.` },
    { text: `Help me get something done in ${item.name}.` },
  ];
}

const MODAL_HEIGHT = "h-[47.6rem]";
const MODAL_WIDTH = "w-[min(34rem,calc(100vw-2rem))]";

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
  const prompts = promptsForConnector(item);
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
    ? "border-destructive/30 bg-destructive/10 text-destructive"
    : isConnected
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : pendingConnection
        ? "border-chart-3/30 bg-chart-3/10 text-chart-3"
        : "border-border bg-muted text-muted-foreground";

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

  const previewConnection: ConnectorConnection = {
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
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy={`connector-detail-${item.id}`}
      className={cn("flex flex-col", MODAL_WIDTH, MODAL_HEIGHT, SHELL_G3_RADIUS)}
      backdropClassName="bg-black/30"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-5 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <ConnectorMark id={item.icon} size="md" className="shrink-0" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2
                    id={`connector-detail-${item.id}`}
                    className="text-[18px] font-semibold tracking-[-0.03em]"
                  >
                    {item.name}
                  </h2>
                  <span
                    className={cn(
                      "inline-flex h-6 items-center border px-2 text-[11px] font-medium tracking-[-0.01em]",
                      SHELL_G3_RADIUS,
                      statusTone,
                    )}
                  >
                    {statusLabel}
                  </span>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className={cn(
                "inline-flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground",
                SHELL_G3_RADIUS,
              )}
            >
              <X className="h-4 w-4" strokeWidth={1.6} />
            </button>
          </div>
        </div>

        <div
          className={cn(
            "mx-5 mt-4 shrink-0 overflow-hidden bg-gradient-to-br from-[#1a2744] via-[#243352] to-[#1e2a40] p-4",
            SHELL_G3_RADIUS,
          )}
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-white/45">
            Try asking
          </p>
          <div className="mt-3 space-y-2">
            {prompts.map((prompt) => (
              <div
                key={prompt.text}
                className={cn(
                  "flex items-center gap-3 border border-white/10 bg-white/[0.06] px-3 py-2.5 backdrop-blur-sm",
                  SHELL_G3_RADIUS,
                )}
              >
                <ConnectorMark id={item.icon} size="xs" className="shrink-0" />
                <p className="min-w-0 flex-1 text-[13px] leading-snug text-white/90">
                  <span className="font-medium text-sky-300">{item.name}</span>{" "}
                  {prompt.text}
                </p>
                <span
                  className={cn(
                    "inline-flex h-8 w-8 shrink-0 items-center justify-center border border-white/15 bg-white/10",
                    SHELL_G3_RADIUS,
                  )}
                >
                  <ArrowRight className="h-3.5 w-3.5 text-white/75" strokeWidth={1.8} />
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 flex min-h-0 flex-1 flex-col px-5 pb-2">
          <p className="mb-3 shrink-0 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
            Skills {skills.length || "—"}
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {activeConnection ? (
              <ConnectorSkillsToggles
                workspaceId={workspaceId}
                connection={activeConnection}
                onUpdated={() => onConnectionsRefresh()}
              />
            ) : (
              <ConnectorSkillsToggles
                workspaceId={workspaceId}
                connection={previewConnection}
                disabled
                disabledHint={
                  canManageServerConnection
                    ? "Connect this app to enable read and write skills for Cander."
                    : "Install this connector to configure skills when support is available."
                }
              />
            )}
          </div>
        </div>

        <div
          className={cn(
            "flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/70 px-5 py-4",
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            {isConnected && tier ? (
              <button
                type="button"
                onClick={onClearPin}
                className={cn(
                  "inline-flex h-10 items-center border border-border px-4 text-[13px] font-medium tracking-[-0.01em] hover:bg-muted",
                  SHELL_G3_RADIUS,
                )}
              >
                Unpin
              </button>
            ) : isConnected ? (
              <button
                type="button"
                onClick={onSetPin}
                className={cn(
                  "inline-flex h-10 items-center border border-border px-4 text-[13px] font-medium tracking-[-0.01em] hover:bg-muted",
                  SHELL_G3_RADIUS,
                )}
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
                className={cn(
                  "inline-flex h-10 items-center border border-destructive/30 px-4 text-[13px] font-medium tracking-[-0.01em] text-destructive hover:bg-destructive/5 disabled:opacity-50",
                  SHELL_G3_RADIUS,
                )}
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
            disabled={
              blocked || busy || (isConnected && !workAttach && !pendingConnection)
            }
            onClick={() => void onConnect()}
            className={cn(
              "inline-flex h-10 items-center bg-foreground px-5 text-[13px] font-medium tracking-[-0.01em] text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50",
              SHELL_G3_RADIUS,
            )}
          >
            {busy ? "Working…" : primaryLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
