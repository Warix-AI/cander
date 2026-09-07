"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Settings2, X } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { ConnectorInfoSection } from "@/components/connectors/ConnectorInfoSection";
import { ConnectorSkillsToggles } from "@/components/connectors/ConnectorSkillsToggles";
import { Modal } from "@/components/ui/Modal";
import { Dropdown } from "@/components/ui/Controls";
import { toolsForConnector } from "@/lib/connectors/tool-catalog";
import type { ConnectorConnection } from "@/lib/connectors/types";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import type { Connector, PinTier } from "@/lib/types";
import { isOauthConnectorId } from "@/lib/connectors/oauth-connectors";
import { appConnectorById } from "@/lib/connectors/apps/definitions";
import { MOBILE_APP_BG } from "@/lib/mobile-menu-styles";
import { cn } from "@/lib/utils";

type ConnectorPrompt = {
  text: string;
};

const CONNECTOR_PROMPTS: Record<string, ConnectorPrompt[]> = {
  gmail: [
    { text: "Search my inbox for unread emails from this week." },
    { text: "Send a quick reply to the latest admissions thread." },
  ],
  gcal: [
    { text: "What's on my calendar today?" },
    { text: "Create a meeting for tomorrow afternoon." },
  ],
  gdrive: [
    { text: "Find recent files in my Drive." },
    { text: "Create a notes file in Drive." },
  ],
  gsheets: [
    { text: "Find my latest spreadsheets." },
    { text: "Create a new spreadsheet for this week’s tracker." },
  ],
  gdocs: [
    { text: "Find my recent Google Docs." },
    { text: "Create a project brief as a Google Doc." },
  ],
  slack: [
    { text: "Search recent Slack messages about the launch." },
    { text: "Post a summary to the team channel." },
  ],
  outlook: [
    { text: "Show my unread Outlook messages from today." },
    { text: "Find emails about the project kickoff." },
  ],
  notion: [
    { text: "Search Notion for our product specs." },
    { text: "Find the latest project notes in Notion." },
  ],
  hubspot: [
    { text: "List recent HubSpot contacts." },
    { text: "Find HubSpot contacts at Acme." },
  ],
  github: [
    { text: "Find open pull requests assigned to me." },
    { text: "Summarize what changed in the repo this week." },
  ],
  teams: [
    { text: "List my Microsoft Teams." },
    { text: "Show channels in my primary team." },
  ],
  stripe: [
    { text: "List recent Stripe customers." },
    { text: "What's my Stripe account balance?" },
  ],
  salesforce: [
    { text: "List Salesforce contacts." },
    { text: "Find a Salesforce contact by name." },
  ],
  linear: [
    { text: "Show my open Linear issues." },
    { text: "Find Linear issues about onboarding." },
  ],
  jira: [
    { text: "Show recently updated Jira issues." },
    { text: "Find Jira issues assigned to me." },
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
  dedicated = false,
  item,
  workspaceId,
  blocked,
  busy,
  tier,
  workAttach,
  onConnect,
  onDisconnect,
  onOpen,
  onConnectionsRefresh,
  onSkillPermissionsUpdated,
  onSetPin,
  onClearPin,
  onPromptSelect,
}: {
  open: boolean;
  onClose: () => void;
  dedicated?: boolean;
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
  onOpen?: () => void;
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
  const isConnected = Boolean(activeConnection);
  const skills = toolsForConnector(item.id);
  const prompts = promptsForConnector(item);
  const canManageServerConnection = isOauthConnectorId(item.id);
  const oauthPending = appConnectorById(item.id)?.oauthReady === false;
  const localInstallOnly =
    !canManageServerConnection &&
    !oauthPending &&
    Boolean(item.installed) &&
    !isConnected;
  const canDisconnectOrUninstall =
    isConnected || Boolean(pendingConnection) || localInstallOnly;

  const statusLabel = blocked
    ? "Blocked"
    : isConnected
      ? "Connected"
      : pendingConnection
        ? "Connecting"
        : oauthPending
          ? "Coming soon"
          : localInstallOnly
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
    : oauthPending
      ? "Coming soon"
      : workAttach
        ? "Add to Work"
        : pendingConnection
          ? "Continue connecting"
          : canManageServerConnection
            ? "Connect"
            : "Install";

  const showActionsMenu = !blocked;
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  useEffect(() => {
    if (!open) setConfirmDisconnect(false);
  }, [open, item.id]);

  // Connected / local-installed apps manage lifecycle from the menu — no Connect footer.
  // Pending OAuth still shows Continue connecting.
  const showConnectFooter =
    !blocked &&
    !oauthPending &&
    (Boolean(workAttach) ||
      Boolean(pendingConnection) ||
      (!isConnected && !localInstallOnly));

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
      embedded={dedicated}
      lockScroll={!dedicated}
      className={cn(
        "flex flex-col",
        dedicated
          ? cn("h-full w-full", MOBILE_APP_BG)
          : cn(MODAL_WIDTH, MODAL_HEIGHT, SHELL_G3_RADIUS),
      )}
      backdropClassName="bg-black/30"
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        {dedicated ? (
          <div className="flex h-12 shrink-0 items-center gap-2 px-5">
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "inline-flex items-center gap-1.5 px-2 py-1 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                SHELL_G3_RADIUS,
              )}
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
              <span>Connectors</span>
            </button>
            <span className="text-muted-foreground/50" aria-hidden="true">
              /
            </span>
            <span className="text-[13px] font-medium text-foreground">
              {item.name}
            </span>
          </div>
        ) : null}
        <div
          className={cn(
            dedicated
              ? "connector-detail-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain"
              : "contents",
          )}
        >
        {confirmDisconnect ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/10 p-4 dark:bg-black/25">
            <div
              className={cn(
                "light-surface w-full max-w-sm bg-white/85 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:bg-zinc-900/85 dark:shadow-[0_16px_40px_rgba(0,0,0,0.28)]",
                SHELL_G3_RADIUS,
              )}
            >
              <p className="text-[15px] font-semibold tracking-[-0.02em]">
                {canManageServerConnection
                  ? "Disconnect connector?"
                  : "Uninstall connector?"}
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                {canManageServerConnection
                  ? `Are you sure you want to disconnect ${item.name}?`
                  : `Are you sure you want to uninstall ${item.name}?`}
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmDisconnect(false)}
                  className={cn(
                    "inline-flex h-9 items-center px-3 text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-50",
                    SHELL_G3_RADIUS,
                  )}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void (async () => {
                      await onDisconnect();
                      setConfirmDisconnect(false);
                    })();
                  }}
                  className={cn(
                    "inline-flex h-9 items-center bg-destructive px-4 text-[13px] font-medium text-destructive-foreground disabled:opacity-50",
                    SHELL_G3_RADIUS,
                  )}
                >
                  {busy
                    ? canManageServerConnection
                      ? "Disconnecting…"
                      : "Uninstalling…"
                    : canManageServerConnection
                      ? "Disconnect"
                      : "Uninstall"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <div
          className={cn(
            dedicated
              ? "mx-auto w-full max-w-[42rem] px-5 pt-[75px]"
              : "contents",
          )}
        >
        <div
          className={cn(
            "relative shrink-0",
            dedicated ? "px-0" : "px-5 pt-5",
          )}
        >
          <div className="absolute top-0 right-0 flex items-center gap-0.5">
            {showActionsMenu ? (
              <Dropdown
                align="end"
                placement="bottom"
                menuClassName={cn(
                  "min-w-[10rem] bg-white/55 shadow-[0_12px_32px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:bg-white/[0.08] dark:shadow-[0_12px_32px_rgba(0,0,0,0.22)]",
                  SHELL_G3_RADIUS,
                )}
                matchTrigger={false}
                trigger={({ toggle }) => (
                  <button
                    type="button"
                    aria-label="Connector options"
                    onClick={toggle}
                    className={cn(
                      "inline-flex h-10 w-12 shrink-0 items-center justify-center text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground",
                      SHELL_G3_RADIUS,
                    )}
                  >
                    <Settings2 className="h-5 w-5" strokeWidth={1.8} />
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
                        className={cn(
                          "flex w-full px-3 py-2 text-left text-[13px] hover:bg-black/[0.06] dark:hover:bg-white/[0.1]",
                          SHELL_G3_RADIUS,
                        )}
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
                        className={cn(
                          "flex w-full px-3 py-2 text-left text-[13px] hover:bg-black/[0.06] dark:hover:bg-white/[0.1]",
                          SHELL_G3_RADIUS,
                        )}
                      >
                        Pin
                      </button>
                    )}
                    {onOpen ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          close();
                          onOpen();
                        }}
                        className={cn(
                          "flex w-full px-3 py-2 text-left text-[13px] hover:bg-black/[0.06] dark:hover:bg-white/[0.1]",
                          SHELL_G3_RADIUS,
                        )}
                      >
                        Open
                      </button>
                    ) : null}
                    {!canDisconnectOrUninstall ? (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={busy}
                        onClick={() => {
                          close();
                          void onConnect();
                        }}
                        className={cn(
                          "flex w-full px-3 py-2 text-left text-[13px] hover:bg-black/[0.06] dark:hover:bg-white/[0.1] disabled:opacity-50",
                          SHELL_G3_RADIUS,
                        )}
                      >
                        {busy ? "Working…" : primaryLabel}
                      </button>
                    ) : null}
                    {canDisconnectOrUninstall ? (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={busy}
                        onClick={() => {
                          close();
                          setConfirmDisconnect(true);
                        }}
                        className={cn(
                          "flex w-full px-3 py-2 text-left text-[13px] text-destructive hover:bg-destructive/5 disabled:opacity-50",
                          SHELL_G3_RADIUS,
                        )}
                      >
                        {canManageServerConnection
                          ? "Disconnect"
                          : "Uninstall"}
                      </button>
                    ) : null}
                  </>
                )}
              </Dropdown>
            ) : null}
            {!dedicated ? (
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
            ) : null}
          </div>

          <div className="flex items-center gap-3 pr-[4.75rem]">
            <ConnectorMark
              id={item.icon}
              size="md"
              className={cn(CONNECTOR_ICON_CLASS, "shrink-0")}
            />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h2
                  id={`connector-detail-${item.id}`}
                  className="truncate text-[22.5px] font-semibold leading-none tracking-[-0.03em]"
                >
                  {item.name}
                </h2>
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
              <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
                {item.description}
              </p>
            </div>
          </div>
        </div>

        <div
          className={cn(
            "relative mt-5 flex min-h-[12rem] shrink-0 items-center overflow-hidden px-5 py-6 panel-wash-host",
            dedicated ? "mx-0" : "mx-5",
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

        <div
          className={cn(
            "mt-5 flex min-h-0 flex-col",
            dedicated ? "px-0 pb-6" : "flex-1 px-5 pb-2",
          )}
        >
          <div
            className={cn(
              !dedicated && "chat-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain",
            )}
          >
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
              "flex shrink-0 items-center justify-end gap-2 border-t border-border/70 py-4",
              dedicated ? "px-0" : "px-5",
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
          <div
            className={cn(
              "shrink-0 border-t border-border/70 py-4",
              dedicated ? "px-0" : "px-5",
            )}
            aria-hidden
          />
        )}
        </div>
        </div>
      </div>
    </Modal>
  );
}
