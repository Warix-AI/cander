"use client";

import { ArrowRight, Ellipsis, X } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { ConnectorInfoSection } from "@/components/connectors/ConnectorInfoSection";
import { ConnectorSkillsToggles } from "@/components/connectors/ConnectorSkillsToggles";
import { Modal } from "@/components/ui/Modal";
import { Dropdown } from "@/components/ui/Controls";
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
const CONNECTOR_ICON_CLASS = "!h-[2.875rem] !w-[2.875rem]";

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
  onSkillPermissionsUpdated,
  onSetPin,
  onClearPin,
  onPromptSelect,
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
  onSkillPermissionsUpdated: (connection: ConnectorConnection) => void;
  onSetPin: () => void;
  onClearPin: () => void;
  onPromptSelect: (text: string) => void;
}) {
  const activeConnection = item.liveConnections?.find(
    (row) => row.status === "active",
  );
  const pendingConnection = activeConnection
    ? undefined
    : item.liveConnections?.find((row) => row.status === "pending");
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
      : pendingConnection
        ? "Continue connecting"
        : canManageServerConnection
          ? "Connect"
          : "Install";

  const showActionsMenu = !blocked;

  const showConnectFooter = !blocked && (workAttach || !isConnected);

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

  const handlePromptClick = (prompt: ConnectorPrompt) => {
    onClose();
    onPromptSelect(`Cander, ${prompt.text}`);
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
        <div className="relative shrink-0 px-5 pt-5">
          <div className="absolute right-4 top-3 flex items-center gap-0.5">
            {showActionsMenu ? (
              <Dropdown
                align="end"
                menuClassName="min-w-[10rem]"
                matchTrigger={false}
                trigger={({ toggle }) => (
                  <button
                    type="button"
                    aria-label="Connector actions"
                    onClick={toggle}
                    className={cn(
                      "inline-flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground",
                      SHELL_G3_RADIUS,
                    )}
                  >
                    <Ellipsis className="h-4 w-4" strokeWidth={1.6} />
                  </button>
                )}
              >
                {(close) => (
                  <>
                    {tier ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onClearPin();
                          close();
                        }}
                        className="flex w-full rounded-[10px] px-3 py-2 text-left text-[13px] hover:bg-muted"
                      >
                        Unpin
                      </button>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onSetPin();
                          close();
                        }}
                        className="flex w-full rounded-[10px] px-3 py-2 text-left text-[13px] hover:bg-muted"
                      >
                        Pin
                      </button>
                    )}
                    {!isConnected &&
                    !pendingConnection &&
                    !item.installed &&
                    !hasLiveConnection ? (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={busy}
                        onClick={() => {
                          close();
                          void onConnect();
                        }}
                        className="flex w-full rounded-[10px] px-3 py-2 text-left text-[13px] hover:bg-muted disabled:opacity-50"
                      >
                        {busy ? "Working…" : primaryLabel}
                      </button>
                    ) : null}
                    {(isConnected ||
                      pendingConnection ||
                      hasLiveConnection ||
                      item.installed) && (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={busy}
                        onClick={() => {
                          close();
                          void onDisconnect();
                        }}
                        className="flex w-full rounded-[10px] px-3 py-2 text-left text-[13px] text-destructive hover:bg-destructive/5 disabled:opacity-50"
                      >
                        {busy
                          ? "Disconnecting…"
                          : canManageServerConnection
                            ? "Disconnect"
                            : "Uninstall"}
                      </button>
                    )}
                  </>
                )}
              </Dropdown>
            ) : null}
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

          <div className="flex items-center gap-3 pr-[4.75rem]">
            <ConnectorMark
              id={item.icon}
              size="md"
              className={cn(CONNECTOR_ICON_CLASS, "shrink-0")}
            />
            <div className="min-w-0 flex-1">
              <h2
                id={`connector-detail-${item.id}`}
                className="text-[22.5px] font-semibold leading-none tracking-[-0.03em]"
              >
                {item.name}
              </h2>
              <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
                {item.description}
              </p>
            </div>
            <span
              className={cn(
                "inline-flex h-5 shrink-0 items-center border px-1.5 text-[9px] font-medium tracking-[-0.01em]",
                SHELL_G3_RADIUS,
                statusTone,
              )}
            >
              {statusLabel}
            </span>
          </div>
        </div>

        <div
          className={cn(
            "relative mx-5 mt-5 flex min-h-[12rem] shrink-0 items-center overflow-hidden px-5 py-6 panel-wash-host",
            SHELL_G3_RADIUS,
          )}
        >
          <div className="panel-grain" aria-hidden />
          <div className="relative w-full origin-center scale-[0.95] space-y-2.5">
            {prompts.map((prompt) => (
              <button
                key={prompt.text}
                type="button"
                onClick={() => handlePromptClick(prompt)}
                className={cn(
                  "flex w-full items-center gap-3 border border-white/40 bg-white/50 px-3 py-3 text-left backdrop-blur-sm transition-colors duration-200 hover:bg-white/65",
                  SHELL_G3_RADIUS,
                )}
              >
                <ConnectorMark id={item.icon} size="xs" className="shrink-0" />
                <p className="min-w-0 flex-1 text-[13px] leading-snug text-neutral-950/88">
                  <span className="font-medium text-neutral-950">Cander</span>{" "}
                  {prompt.text}
                </p>
                <span
                  className={cn(
                    "inline-flex h-8 w-8 shrink-0 items-center justify-center border border-white/45 bg-white/55 text-neutral-950/70",
                    SHELL_G3_RADIUS,
                  )}
                >
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.8} />
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex min-h-0 flex-1 flex-col px-5 pb-2">
          <div className="chat-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Skills {skills.length || "—"}
            </p>
            {activeConnection ? (
              <ConnectorSkillsToggles
                workspaceId={workspaceId}
                connection={activeConnection}
                onUpdated={(updated) => {
                  onSkillPermissionsUpdated(updated);
                  onConnectionsRefresh();
                }}
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
            <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Information
            </p>
            <ConnectorInfoSection item={item} className="pb-2" />
          </div>
        </div>

        {showConnectFooter ? (
          <div
            className={cn(
              "flex shrink-0 items-center justify-end gap-2 border-t border-border/70 px-5 py-4",
            )}
          >
            <button
              type="button"
              disabled={blocked || busy}
              onClick={() => void onConnect()}
              className={cn(
                "inline-flex h-10 items-center bg-foreground px-5 text-[13px] font-medium tracking-[-0.01em] text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50",
                SHELL_G3_RADIUS,
              )}
            >
              {busy ? "Working…" : primaryLabel}
            </button>
          </div>
        ) : (
          <div className="shrink-0 border-t border-border/70 px-5 py-4" aria-hidden />
        )}
      </div>
    </Modal>
  );
}
