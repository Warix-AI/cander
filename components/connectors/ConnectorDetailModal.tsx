"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Settings2, X } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { ConnectorAccountBar } from "@/components/connectors/ConnectorAccountBar";
import { ConnectorInfoSection } from "@/components/connectors/ConnectorInfoSection";
import { ConnectorSkillsToggles } from "@/components/connectors/ConnectorSkillsToggles";
import { ConnectorWorkspaceShareToggle } from "@/components/connectors/ConnectorWorkspaceShareToggle";
import { Modal } from "@/components/ui/Modal";
import { Dropdown } from "@/components/ui/Controls";
import {
  CONNECTOR_DISPLAY_NAME_MAX,
  canAddAnotherConnectorAccount,
  connectorAccountNeedsRename,
  validateUniqueConnectorDisplayName,
} from "@/lib/connectors/account-names";
import { toolsForConnector } from "@/lib/connectors/tool-catalog";
import type { ConnectorConnection } from "@/lib/connectors/types";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import type { Connector, PinTier } from "@/lib/types";
import { isOauthConnectorId } from "@/lib/connectors/oauth-connectors";
import { appConnectorById } from "@/lib/connectors/apps/definitions";
import { MOBILE_APP_BG } from "@/lib/mobile-menu-styles";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

type ConnectorPrompt = {
  text: string;
};

const CONNECTOR_PROMPTS: Record<string, ConnectorPrompt[]> = {
  gmail: [
    { text: "Find unread mail." },
    { text: "Reply to the latest email." },
  ],
  gcal: [
    { text: "What's on today?" },
    { text: "Schedule a meeting." },
  ],
  gdrive: [
    { text: "Find recent files." },
    { text: "Create a notes file." },
  ],
  gsheets: [
    { text: "Find recent sheets." },
    { text: "Create a new spreadsheet." },
  ],
  gdocs: [
    { text: "Find recent docs." },
    { text: "Create a new doc." },
  ],
  slack: [
    { text: "Search recent messages." },
    { text: "Post a channel update." },
  ],
  outlook: [
    { text: "Show unread mail." },
    { text: "Find a recent email." },
  ],
  notion: [
    { text: "Search Notion pages." },
    { text: "Find project notes." },
  ],
  hubspot: [
    { text: "List recent contacts." },
    { text: "Find a contact." },
  ],
  github: [
    { text: "Show my open PRs." },
    { text: "Summarize recent changes." },
  ],
  teams: [
    { text: "List my teams." },
    { text: "Show team channels." },
  ],
  stripe: [
    { text: "List recent customers." },
    { text: "Show account balance." },
  ],
  salesforce: [
    { text: "List contacts." },
    { text: "Find a contact." },
  ],
  linear: [
    { text: "Show open issues." },
    { text: "Find an issue." },
  ],
  jira: [
    { text: "Show recent issues." },
    { text: "Find my issues." },
  ],
};

function promptsForConnector(item: Connector): ConnectorPrompt[] {
  if (CONNECTOR_PROMPTS[item.id]?.length) {
    return CONNECTOR_PROMPTS[item.id]!;
  }
  return [
    { text: `Search ${item.name}.` },
    { text: `Help with ${item.name}.` },
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
  onRename,
  onConnectionsRefresh,
  onSkillPermissionsUpdated,
  onSetPin,
  onPromptSelect,
  renameRequestNonce = 0,
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
  onConnect: (opts: {
    displayName: string;
    forceNew?: boolean;
  }) => Promise<ConnectorConnection | void>;
  onDisconnect: (connectionId: string) => Promise<void>;
  onRename: (connectionId: string, displayName: string) => Promise<void>;
  onConnectionsRefresh: () => void;
  onSkillPermissionsUpdated: (connection: ConnectorConnection) => void;
  onSetPin: () => void;
  onPromptSelect: (text: string) => void;
  /** Bumped by parent (e.g. mobile header) to open rename. */
  renameRequestNonce?: number;
}) {
  const mobile = useMobileShell();
  const liveAccounts = useMemo(
    () =>
      (item.liveConnections ?? []).filter(
        (row) =>
          (row.status === "active" || row.status === "pending") &&
          row.ownedByViewer !== false,
      ),
    [item.liveConnections],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [namePrompt, setNamePrompt] = useState<null | {
    mode: "connect" | "add" | "rename";
    value: string;
    error: string | null;
  }>(null);

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setNamePrompt(null);
      return;
    }
    setSelectedId((prev) => {
      if (prev && liveAccounts.some((row) => row.id === prev)) return prev;
      return liveAccounts[0]?.id ?? null;
    });
  }, [open, item.id, liveAccounts]);

  const selectedConnection =
    liveAccounts.find((row) => row.id === selectedId) ?? liveAccounts[0];
  const activeConnection =
    selectedConnection?.status === "active" ? selectedConnection : undefined;
  const pendingConnection =
    selectedConnection?.status === "pending"
      ? selectedConnection
      : liveAccounts.find((row) => row.status === "pending");
  const isConnected = Boolean(activeConnection);
  const skills = toolsForConnector(item.id);
  const prompts = promptsForConnector(item);
  const canManageServerConnection = isOauthConnectorId(item.id);
  const oauthPending = appConnectorById(item.id)?.oauthReady === false;
  const localInstallOnly =
    !canManageServerConnection &&
    !oauthPending &&
    Boolean(item.installed) &&
    !liveAccounts.length;
  const canDisconnectOrUninstall =
    Boolean(selectedConnection) || localInstallOnly;
  const canAddAccount =
    canManageServerConnection &&
    !oauthPending &&
    !blocked &&
    canAddAnotherConnectorAccount(liveAccounts.length);

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

  const showAccountBar = canManageServerConnection && !oauthPending && !blocked;
  const menuHasItems =
    Boolean(selectedConnection && canManageServerConnection) ||
    canDisconnectOrUninstall ||
    (!canDisconnectOrUninstall && !showAccountBar);
  const showActionsMenu =
    !blocked && !(dedicated && mobile) && menuHasItems;
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  useEffect(() => {
    if (!open) setConfirmDisconnect(false);
  }, [open, item.id]);

  // Connected OAuth / installed connectors auto-pin into the Connectors section.
  useEffect(() => {
    if (!open || blocked || !isConnected || tier) return;
    onSetPin();
  }, [open, blocked, isConnected, tier, onSetPin]);

  // Account bar owns first Connect for OAuth connectors. Footer keeps
  // Continue connecting / Work attach / non-OAuth connect only.
  const showConnectFooter =
    !blocked &&
    !oauthPending &&
    (Boolean(workAttach) ||
      Boolean(pendingConnection && !liveAccounts.some((r) => r.status === "active")) ||
      (!liveAccounts.length && !localInstallOnly && !canManageServerConnection));

  const previewConnection: ConnectorConnection = {
    id: "preview",
    workspaceId,
    connectorId: item.id,
    status: "pending",
    connectionMode: "personal",
    displayName: "Account",
    ownedByViewer: true,
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

  const openNamePrompt = (
    mode: "connect" | "add" | "rename",
    connectionId?: string,
  ) => {
    const target =
      (connectionId
        ? liveAccounts.find((row) => row.id === connectionId)
        : null) ?? selectedConnection;
    const raw =
      mode === "rename" && target
        ? connectorAccountNeedsRename(target.displayName)
          ? ""
          : target.displayName
        : "";
    if (connectionId) setSelectedId(connectionId);
    setNamePrompt({
      mode,
      value: raw,
      error: null,
    });
  };

  useEffect(() => {
    if (!renameRequestNonce || !open) return;
    if (!selectedConnection || !canManageServerConnection) return;
    openNamePrompt("rename");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- renameRequestNonce
  }, [renameRequestNonce]);

  const submitNamePrompt = async () => {
    if (!namePrompt) return;
    const check = validateUniqueConnectorDisplayName({
      raw: namePrompt.value,
      existing: liveAccounts.map((row) => ({
        id: row.id,
        displayName: row.displayName,
      })),
      excludeId:
        namePrompt.mode === "rename" ? selectedConnection?.id : undefined,
    });
    if (!check.ok) {
      setNamePrompt({ ...namePrompt, error: check.error });
      return;
    }
    const mode = namePrompt.mode;
    setNamePrompt(null);
    if (mode === "rename" && selectedConnection) {
      await onRename(selectedConnection.id, check.value);
      return;
    }
    // + always starts a fresh OAuth account (external/new tab), never
    // resumes a prior pending connection for a different label.
    const created = await onConnect({
      displayName: check.value,
      forceNew: mode === "add" || liveAccounts.length > 0,
    });
    if (created?.id) setSelectedId(created.id);
  };

  const handlePromptClick = (prompt: ConnectorPrompt) => {
    onClose();
    onPromptSelect(`Cander, ${prompt.text}`);
  };

  const namePromptTitleId = `connector-account-name-${item.id}`;
  const disconnectTitleId = `connector-disconnect-${item.id}`;

  return (
    <>
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
        {dedicated && !mobile ? (
          <div className="flex h-12 shrink-0 items-center gap-2 px-5">
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "text-[13px] text-muted-foreground transition-colors hover:text-foreground",
                SHELL_G3_RADIUS,
              )}
            >
              Connectors
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
        <div
          className={cn(
            dedicated
              ? cn(
                  "mx-auto w-full max-w-[42rem] px-5",
                  // Clear mobile chrome + ~20px breathing room under the header.
                  mobile
                    ? "pt-[calc(env(safe-area-inset-top,0px)+5.75rem)]"
                    : "pt-[75px]",
                )
              : "contents",
          )}
        >
        <div
          className={cn(
            "relative shrink-0",
            dedicated ? "px-0" : "px-5 pt-5",
          )}
        >
          {showAccountBar ? (
            <ConnectorAccountBar
              className="mb-4"
              connectorIcon={item.icon}
              accounts={liveAccounts}
              activeId={selectedConnection?.id ?? null}
              onSelect={setSelectedId}
              addDisabled={!canAddAccount || busy}
              connectDisabled={busy}
              onConnect={() => {
                openNamePrompt("connect");
              }}
              onAdd={() => {
                if (!canAddAccount) return;
                openNamePrompt("add");
              }}
            />
          ) : null}
          <div
            className={cn(
              "absolute right-0 flex items-center gap-0.5",
              showAccountBar ? "top-[4.75rem]" : "top-0",
            )}
          >
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
                    {selectedConnection && canManageServerConnection ? (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={busy}
                        onClick={() => {
                          close();
                          openNamePrompt("rename");
                        }}
                        className={cn(
                          "flex w-full px-3 py-2 text-left text-[13px] hover:bg-black/[0.06] dark:hover:bg-white/[0.1] disabled:opacity-50",
                          SHELL_G3_RADIUS,
                        )}
                      >
                        Rename
                      </button>
                    ) : null}
                    {!canDisconnectOrUninstall && !showAccountBar ? (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={busy}
                        onClick={() => {
                          close();
                          void onConnect({ displayName: "Account" });
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
              Access
            </p>
            {activeConnection ? (
              <ConnectorWorkspaceShareToggle
                workspaceId={workspaceId}
                connection={activeConnection}
                onUpdated={(updated) => {
                  onSkillPermissionsUpdated(updated);
                  onConnectionsRefresh();
                }}
              />
            ) : (
              <ConnectorWorkspaceShareToggle
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
              onClick={() => {
                if (pendingConnection && canManageServerConnection) {
                  void onConnect({
                    displayName: pendingConnection.displayName,
                    forceNew: false,
                  });
                  return;
                }
                if (canManageServerConnection) {
                  openNamePrompt("connect");
                  return;
                }
                void onConnect({ displayName: "Account" });
              }}
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

    <Modal
      open={Boolean(namePrompt)}
      onClose={() => setNamePrompt(null)}
      labelledBy={namePromptTitleId}
      className={cn("w-full max-w-sm p-4", SHELL_G3_RADIUS)}
      backdropClassName="bg-black/30"
      sheetOnMobile
      sheetSize="tall"
    >
      {namePrompt ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <p
            id={namePromptTitleId}
            className="text-[15px] font-semibold tracking-[-0.02em]"
          >
            {namePrompt.mode === "rename"
              ? "Rename account"
              : namePrompt.mode === "add"
                ? "Name this account"
                : "Name your account"}
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            Choose a short Cander label (1–{CONNECTOR_DISPLAY_NAME_MAX}{" "}
            characters). This does not change the provider account.
          </p>
          <input
            autoFocus
            value={namePrompt.value}
            maxLength={CONNECTOR_DISPLAY_NAME_MAX}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            onChange={(event) =>
              setNamePrompt({
                ...namePrompt,
                value: event.target.value,
                error: null,
              })
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submitNamePrompt();
              }
            }}
            placeholder="e.g. Team"
            className="mt-4 h-12 w-full rounded-[10px] border border-border bg-white px-3 text-[16px] outline-none dark:bg-space-canvas"
          />
          {namePrompt.error ? (
            <p className="mt-2 text-[12px] text-destructive">
              {namePrompt.error}
            </p>
          ) : (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {namePrompt.value.trim().length}/{CONNECTOR_DISPLAY_NAME_MAX}
            </p>
          )}
          <div className="mt-auto flex justify-end gap-2 pt-6">
            <button
              type="button"
              disabled={busy}
              onClick={() => setNamePrompt(null)}
              className={cn(
                "inline-flex h-11 items-center px-3 text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-50",
                SHELL_G3_RADIUS,
              )}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submitNamePrompt()}
              className={cn(
                "inline-flex h-11 items-center bg-foreground px-4 text-[13px] font-medium text-background disabled:opacity-50",
                SHELL_G3_RADIUS,
              )}
            >
              {busy
                ? "Working…"
                : namePrompt.mode === "rename"
                  ? "Save"
                  : "Continue"}
            </button>
          </div>
        </div>
      ) : null}
    </Modal>

    <Modal
      open={confirmDisconnect}
      onClose={() => setConfirmDisconnect(false)}
      labelledBy={disconnectTitleId}
      className={cn("w-full max-w-sm p-4", SHELL_G3_RADIUS)}
      backdropClassName="bg-black/30"
      sheetOnMobile
    >
      <p
        id={disconnectTitleId}
        className="text-[15px] font-semibold tracking-[-0.02em]"
      >
        {canManageServerConnection
          ? "Disconnect account?"
          : "Uninstall connector?"}
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
        {canManageServerConnection
          ? `Disconnect “${selectedConnection?.displayName ?? item.name}”? Other accounts for ${item.name} stay connected.`
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
              if (selectedConnection) {
                await onDisconnect(selectedConnection.id);
              } else {
                await onDisconnect("");
              }
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
    </Modal>
    </>
  );
}
