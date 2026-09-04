"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  Archive,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Forward,
  Mail,
  MailOpen,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  RefreshCw,
  Reply,
  RotateCw,
  X,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { BrowserSurfaceHost } from "@/components/browser/BrowserSurfaceHost";
import { BrowserChromeTooltip } from "@/components/browser/BrowserChromeTooltip";
import { BrowserAddressField } from "@/components/browser/BrowserAddressField";
import { FaviconImage } from "@/components/browser/FaviconImage";
import {
  GmailConnectorView,
  type GmailToolbarState,
} from "@/components/connectors/views/GmailConnectorView";
import { CalendarConnectorView } from "@/components/connectors/views/CalendarConnectorView";
import { DriveConnectorView } from "@/components/connectors/views/DriveConnectorView";
import { SheetsConnectorView } from "@/components/connectors/views/SheetsConnectorView";
import { DocsConnectorView } from "@/components/connectors/views/DocsConnectorView";
import type { WorkspaceToolbarState } from "@/components/connectors/views/WorkspaceViewChrome";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import {
  BrowserChromeIconButton,
  PanelToggle,
  clearBrowserChromeHovers,
} from "@/components/shell/PanelToggle";
import { CONNECTOR_CATALOG } from "@/lib/api/connector-catalog";
import {
  connectorBrowserStorageKey,
  getConnectorBrowserSession,
  makeConnectorWebTab,
  navigateConnectorWebTab,
  openUrlInConnectorBrowserSession,
  setConnectorBrowserSession,
  subscribeConnectorBrowserSession,
  type ConnectorBrowserSession,
  type ConnectorBrowserTab,
} from "@/lib/connector-browser-session";
import { normalizeBrowserUrl, titleFromUrl } from "@/lib/preview-url";
import { recordBrowserVisit } from "@/lib/browser-recent-history";
import {
  BROWSER_CHROME_CHIP,
  BROWSER_CHROME_CHIP_HOVER,
  SHELL_PANEL_BODY,
} from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

const PANEL_SURFACE = "bg-white dark:bg-space-canvas";
/** Connector chrome matches the space canvas (menu-matched dark). */
const CONNECTOR_CHROME_BG = "bg-white dark:bg-space-canvas";

function sessionSnapshot(
  key: string,
  connectorId: string,
  title: string,
): ConnectorBrowserSession {
  return getConnectorBrowserSession(key, connectorId, title);
}

/**
 * Browser-style host for connector views: top tabs + expand/panel,
 * bottom chrome for connector actions or web URL nav.
 * The connector tab is always first and cannot be closed.
 */
export function ConnectorBrowserPanel({ connectorId }: { connectorId: string }) {
  const {
    workspaceId,
    actor,
    drafting,
    thread,
    panelMode,
    expandedLayout,
    toggleExpandedLayout,
  } = useApp();
  const catalog = CONNECTOR_CATALOG.find((item) => item.id === connectorId);
  const title = catalog?.name ?? connectorId;
  const storageKey = connectorBrowserStorageKey(
    actor.id,
    workspaceId,
    connectorId,
  );

  const session = useSyncExternalStore(
    subscribeConnectorBrowserSession,
    () => sessionSnapshot(storageKey, connectorId, title),
    () => sessionSnapshot(storageKey, connectorId, title),
  );

  const active =
    session.tabs.find((tab) => tab.id === session.activeTabId) ??
    session.tabs[0]!;
  const chatArmed = drafting || Boolean(thread);
  const [gmailToolbar, setGmailToolbar] = useState<GmailToolbarState | null>(
    null,
  );
  const gmailToolbarRef = useRef(gmailToolbar);
  gmailToolbarRef.current = gmailToolbar;
  const onGmailToolbarChange = useCallback((next: GmailToolbarState) => {
    gmailToolbarRef.current = next;
    setGmailToolbar((prev) => {
      if (
        prev &&
        prev.page === next.page &&
        prev.syncing === next.syncing &&
        prev.busy === next.busy &&
        prev.canGoInbox === next.canGoInbox &&
        prev.isUnread === next.isUnread &&
        prev.syncHint === next.syncHint
      ) {
        return prev;
      }
      return next;
    });
  }, []);
  const [workspaceToolbar, setWorkspaceToolbar] =
    useState<WorkspaceToolbarState | null>(null);
  const workspaceToolbarRef = useRef(workspaceToolbar);
  workspaceToolbarRef.current = workspaceToolbar;
  const onWorkspaceToolbarChange = useCallback((next: WorkspaceToolbarState) => {
    workspaceToolbarRef.current = next;
    setWorkspaceToolbar((prev) => {
      if (
        prev &&
        prev.title === next.title &&
        prev.syncing === next.syncing &&
        prev.busy === next.busy &&
        prev.canGoBack === next.canGoBack &&
        prev.primaryLabel === next.primaryLabel
      ) {
        return prev;
      }
      return next;
    });
  }, []);
  const isWorkspaceConnector =
    connectorId === "gcal" ||
    connectorId === "gdrive" ||
    connectorId === "gsheets" ||
    connectorId === "gdocs";
  const [addressDraft, setAddressDraft] = useState(active.url);
  const [webReloadKey, setWebReloadKey] = useState(0);

  useEffect(() => {
    setAddressDraft(active.kind === "web" ? active.url : "");
  }, [active.id, active.kind, active.url]);

  const updateSession = useCallback(
    (next: ConnectorBrowserSession) => {
      setConnectorBrowserSession(storageKey, next, connectorId, title);
    },
    [storageKey, connectorId, title],
  );

  const selectTab = (id: string) => {
    updateSession({ ...session, activeTabId: id });
  };

  const closeTab = (id: string) => {
    const tab = session.tabs.find((item) => item.id === id);
    if (!tab || tab.pinned || tab.kind === "connector") return;
    if (session.tabs.length <= 1) {
      const blank = makeConnectorWebTab();
      updateSession({ tabs: [blank], activeTabId: blank.id });
      return;
    }
    const tabs = session.tabs.filter((item) => item.id !== id);
    const activeTabId =
      session.activeTabId === id ? tabs[0]!.id : session.activeTabId;
    updateSession({ tabs, activeTabId });
  };

  const addUrlTab = () => {
    const tab = makeConnectorWebTab();
    updateSession({
      tabs: [...session.tabs, tab],
      activeTabId: tab.id,
    });
  };

  const openLink = useCallback(
    (url: string) => {
      const next = openUrlInConnectorBrowserSession(session, url);
      updateSession(next);
    },
    [session, updateSession],
  );

  const commitAddress = () => {
    if (active.kind !== "web") return;
    const url = normalizeBrowserUrl(addressDraft);
    if (!url) return;
    const tabs = session.tabs.map((tab) =>
      tab.id === active.id
        ? navigateConnectorWebTab(tab, url, titleFromUrl(url))
        : tab,
    );
    updateSession({ ...session, tabs });
    if (url !== "about:blank") {
      recordBrowserVisit({ url, title: titleFromUrl(url) });
    }
  };

  const onWebUrlChange = (url: string) => {
    const tabs = session.tabs.map((tab) =>
      tab.id === active.id
        ? {
            ...tab,
            url,
            title: titleFromUrl(url) || tab.title,
            faviconUrl: url === tab.url ? tab.faviconUrl : null,
          }
        : tab,
    );
    updateSession({ ...session, tabs });
  };

  const onWebTitleChange = (nextTitle: string) => {
    const tabs = session.tabs.map((tab) =>
      tab.id === active.id ? { ...tab, title: nextTitle || tab.title } : tab,
    );
    updateSession({ ...session, tabs });
  };

  const onWebFaviconChange = (faviconUrl: string | null) => {
    const tabs = session.tabs.map((tab) =>
      tab.id === active.id ? { ...tab, faviconUrl } : tab,
    );
    updateSession({ ...session, tabs });
  };

  const isConnectorTab = active.kind === "connector";

  return (
    <div className={cn(SHELL_PANEL_BODY, CONNECTOR_CHROME_BG)}>
      {/* Top header — tabs + expand + panel only */}
      <div
        className={cn(
          "flex h-[45px] min-w-0 shrink-0 items-center gap-1 px-2",
          CONNECTOR_CHROME_BG,
        )}
        onPointerLeave={clearBrowserChromeHovers}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          {session.tabs.map((tab) => (
            <ConnectorTabButton
              key={tab.id}
              tab={tab}
              active={tab.id === active.id}
              onSelect={() => selectTab(tab.id)}
              onClose={() => closeTab(tab.id)}
            />
          ))}
          <BrowserChromeTooltip label="New tab">
            <button
              type="button"
              aria-label="New tab"
              onClick={addUrlTab}
              className={cn(
                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors",
                BROWSER_CHROME_CHIP_HOVER,
                "hover:text-foreground",
              )}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
          </BrowserChromeTooltip>
        </div>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {chatArmed ? (
            <BrowserChromeTooltip
              label={expandedLayout ? "Restore layout" : "Expand"}
            >
              <BrowserChromeIconButton
                aria-label={expandedLayout ? "Restore layout" : "Expand"}
                onClick={() => toggleExpandedLayout()}
              >
                {expandedLayout ? (
                  <Minimize2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                )}
              </BrowserChromeIconButton>
            </BrowserChromeTooltip>
          ) : null}
          {chatArmed ? (
            <BrowserChromeTooltip
              label={
                panelMode === "collapsed"
                  ? "Open right panel"
                  : "Close right panel"
              }
            >
              <PanelToggle />
            </BrowserChromeTooltip>
          ) : null}
        </span>
      </div>

      {/* Bottom header — connector tools or web URL nav */}
      <div
        className={cn(
          "relative flex h-[45px] min-w-0 shrink-0 items-center gap-1 border-t border-black/5 px-2 dark:border-white/10",
          CONNECTOR_CHROME_BG,
        )}
      >
        {isConnectorTab && connectorId === "gmail" ? (
          gmailToolbar?.page === "detail" ? (
            <>
              <ChromeBtn
                label="Inbox"
                onClick={() => gmailToolbarRef.current?.onInbox()}
              >
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.6} />
              </ChromeBtn>
              <span className="truncate text-[12.5px] font-medium text-foreground">
                Inbox
              </span>
              <div className="ml-auto flex items-center gap-0.5">
                <ChromeBtn
                  label="Reply"
                  disabled={Boolean(gmailToolbar?.busy)}
                  onClick={() => gmailToolbarRef.current?.onFocusReply()}
                >
                  <Reply className="h-3.5 w-3.5" strokeWidth={1.6} />
                </ChromeBtn>
                <ChromeBtn
                  label="Archive"
                  disabled={Boolean(gmailToolbar?.busy)}
                  onClick={() => gmailToolbarRef.current?.onArchive()}
                >
                  <Archive className="h-3.5 w-3.5" strokeWidth={1.6} />
                </ChromeBtn>
                <ChromeBtn
                  label={gmailToolbar.isUnread ? "Mark read" : "Mark unread"}
                  disabled={Boolean(gmailToolbar?.busy)}
                  onClick={() => gmailToolbarRef.current?.onToggleRead()}
                >
                  {gmailToolbar.isUnread ? (
                    <MailOpen className="h-3.5 w-3.5" strokeWidth={1.6} />
                  ) : (
                    <Mail className="h-3.5 w-3.5" strokeWidth={1.6} />
                  )}
                </ChromeBtn>
                <ChromeBtn
                  label="Forward"
                  disabled={Boolean(gmailToolbar?.busy)}
                  onClick={() => gmailToolbarRef.current?.onForward()}
                >
                  <Forward className="h-3.5 w-3.5" strokeWidth={1.6} />
                </ChromeBtn>
              </div>
            </>
          ) : gmailToolbar?.canGoInbox ? (
            <>
              <ChromeBtn
                label="Inbox"
                onClick={() => gmailToolbarRef.current?.onInbox()}
              >
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.6} />
              </ChromeBtn>
              <span className="truncate text-[12.5px] font-medium text-foreground">
                {gmailToolbar.page === "forward" ? "Forward" : "Compose"}
              </span>
            </>
          ) : (
            <>
              <span className="truncate px-1 text-[12.5px] font-medium text-foreground">
                Inbox
              </span>
              <span
                className="min-w-0 max-w-[11rem] truncate text-[11px] text-muted-foreground"
                aria-live="polite"
              >
                {gmailToolbar?.syncHint ?? ""}
              </span>
              <div className="ml-auto flex items-center gap-0.5">
                <ChromeBtn
                  label="Refresh"
                  disabled={Boolean(gmailToolbar?.syncing)}
                  onClick={() => gmailToolbarRef.current?.onRefresh()}
                >
                  <RefreshCw
                    className={cn(
                      "h-3.5 w-3.5",
                      gmailToolbar?.syncing && "animate-spin",
                    )}
                    strokeWidth={1.6}
                  />
                </ChromeBtn>
                <ChromeBtn
                  label="Compose"
                  onClick={() => gmailToolbarRef.current?.onCompose()}
                >
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.6} />
                </ChromeBtn>
              </div>
            </>
          )
        ) : isConnectorTab && isWorkspaceConnector ? (
          <>
            {workspaceToolbar?.canGoBack ? (
              <ChromeBtn
                label={workspaceToolbar.backLabel ?? "Back"}
                onClick={() => workspaceToolbarRef.current?.onBack()}
              >
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.6} />
              </ChromeBtn>
            ) : null}
            <span className="truncate px-1 text-[12.5px] font-medium text-foreground">
              {workspaceToolbar?.title ?? title}
            </span>
            <div className="ml-auto flex items-center gap-0.5">
              <ChromeBtn
                label="Refresh"
                disabled={Boolean(workspaceToolbar?.syncing)}
                onClick={() => workspaceToolbarRef.current?.onRefresh()}
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5",
                    workspaceToolbar?.syncing && "animate-spin",
                  )}
                  strokeWidth={1.6}
                />
              </ChromeBtn>
              {workspaceToolbar?.primaryLabel && workspaceToolbar.onPrimary ? (
                <ChromeBtn
                  label={workspaceToolbar.primaryLabel}
                  disabled={Boolean(workspaceToolbar.busy)}
                  onClick={() => workspaceToolbarRef.current?.onPrimary?.()}
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={1.6} />
                </ChromeBtn>
              ) : null}
            </div>
          </>
        ) : isConnectorTab ? (
          <span className="truncate px-1 text-[12.5px] font-medium text-foreground">
            {title}
          </span>
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-0.5">
              <ChromeBtn
                label="Back"
                disabled={
                  active.kind !== "web" || active.historyIndex <= 0
                }
                onClick={() => {
                  if (active.kind !== "web" || active.historyIndex <= 0) return;
                  const nextIndex = active.historyIndex - 1;
                  const url = active.history[nextIndex]!;
                  const tabs = session.tabs.map((tab) =>
                    tab.id === active.id
                      ? {
                          ...tab,
                          url,
                          historyIndex: nextIndex,
                          title: titleFromUrl(url) || tab.title,
                        }
                      : tab,
                  );
                  updateSession({ ...session, tabs });
                  setAddressDraft(url === "about:blank" ? "" : url);
                }}
              >
                <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.6} />
              </ChromeBtn>
              <ChromeBtn
                label="Forward"
                disabled={
                  active.kind !== "web" ||
                  active.historyIndex >= active.history.length - 1
                }
                onClick={() => {
                  if (
                    active.kind !== "web" ||
                    active.historyIndex >= active.history.length - 1
                  ) {
                    return;
                  }
                  const nextIndex = active.historyIndex + 1;
                  const url = active.history[nextIndex]!;
                  const tabs = session.tabs.map((tab) =>
                    tab.id === active.id
                      ? {
                          ...tab,
                          url,
                          historyIndex: nextIndex,
                          title: titleFromUrl(url) || tab.title,
                        }
                      : tab,
                  );
                  updateSession({ ...session, tabs });
                  setAddressDraft(url === "about:blank" ? "" : url);
                }}
              >
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.6} />
              </ChromeBtn>
              <ChromeBtn
                label="Reload"
                onClick={() => {
                  if (active.kind !== "web") return;
                  setWebReloadKey((key) => key + 1);
                }}
              >
                <RotateCw className="h-3.5 w-3.5" strokeWidth={1.6} />
              </ChromeBtn>
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-[7.5rem]">
              <BrowserAddressField
                className="pointer-events-auto"
                url={active.url || "about:blank"}
                draft={
                  addressDraft === "about:blank" ? "" : addressDraft
                }
                onDraftChange={setAddressDraft}
                onCommit={commitAddress}
                onNavigateTo={(raw) => {
                  const url = normalizeBrowserUrl(raw);
                  setAddressDraft(url === "about:blank" ? "" : url);
                  if (active.kind !== "web") return;
                  const tabs = session.tabs.map((tab) =>
                    tab.id === active.id
                      ? navigateConnectorWebTab(tab, url, titleFromUrl(url))
                      : tab,
                  );
                  updateSession({ ...session, tabs });
                  if (url !== "about:blank") {
                    recordBrowserVisit({ url, title: titleFromUrl(url) });
                  }
                }}
                faviconUrl={active.faviconUrl}
                showFavicon={false}
                placeholder="Search"
                autoEditKey={
                  active.kind === "web" &&
                  (!active.url || active.url === "about:blank")
                    ? active.id
                    : null
                }
              />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              <ChromeBtn
                label="Open in new tab"
                onClick={() => {
                  if (active.kind !== "web" || !active.url || active.url === "about:blank") {
                    addUrlTab();
                    return;
                  }
                  openLink(active.url);
                }}
              >
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.6} />
              </ChromeBtn>
            </div>
          </>
        )}
      </div>

      {/* Body — keep connector views mounted when opening link tabs */}
      <div
        className={cn(
          "relative flex min-h-0 flex-1 flex-col overflow-hidden",
          PANEL_SURFACE,
        )}
      >
        {connectorId === "gmail" ? (
          <div
            className={cn(
              "absolute inset-0 flex min-h-0 flex-col",
              !isConnectorTab && "invisible pointer-events-none",
            )}
            aria-hidden={!isConnectorTab}
          >
            <GmailConnectorView
              onOpenLink={openLink}
              onToolbarChange={onGmailToolbarChange}
            />
          </div>
        ) : connectorId === "gcal" ? (
          <div
            className={cn(
              "absolute inset-0 flex min-h-0 flex-col",
              !isConnectorTab && "invisible pointer-events-none",
            )}
            aria-hidden={!isConnectorTab}
          >
            <CalendarConnectorView onToolbarChange={onWorkspaceToolbarChange} />
          </div>
        ) : connectorId === "gdrive" ? (
          <div
            className={cn(
              "absolute inset-0 flex min-h-0 flex-col",
              !isConnectorTab && "invisible pointer-events-none",
            )}
            aria-hidden={!isConnectorTab}
          >
            <DriveConnectorView onToolbarChange={onWorkspaceToolbarChange} />
          </div>
        ) : connectorId === "gsheets" ? (
          <div
            className={cn(
              "absolute inset-0 flex min-h-0 flex-col",
              !isConnectorTab && "invisible pointer-events-none",
            )}
            aria-hidden={!isConnectorTab}
          >
            <SheetsConnectorView onToolbarChange={onWorkspaceToolbarChange} />
          </div>
        ) : connectorId === "gdocs" ? (
          <div
            className={cn(
              "absolute inset-0 flex min-h-0 flex-col",
              !isConnectorTab && "invisible pointer-events-none",
            )}
            aria-hidden={!isConnectorTab}
          >
            <DocsConnectorView onToolbarChange={onWorkspaceToolbarChange} />
          </div>
        ) : isConnectorTab ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-muted-foreground">
            Connector view coming soon for {title}.
          </div>
        ) : null}
        {!isConnectorTab ? (
          <BrowserSurfaceHost
            tabId={active.id}
            url={
              active.url && active.url !== "about:blank"
                ? active.url
                : "about:blank"
            }
            userId={actor.id}
            active={panelMode !== "collapsed"}
            reloadKey={webReloadKey}
            onUrlChange={onWebUrlChange}
            onTitleChange={onWebTitleChange}
            onFaviconChange={onWebFaviconChange}
            onOpenNewTab={openLink}
          />
        ) : null}
      </div>
    </div>
  );
}

function ConnectorTabButton({
  tab,
  active,
  onSelect,
  onClose,
}: {
  tab: ConnectorBrowserTab;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const canClose = !tab.pinned && tab.kind !== "connector";
  return (
    <div
      className={cn(
        "group relative flex h-8 max-w-[10.5rem] min-w-0 items-center gap-1.5 rounded-[8px] px-2 text-[12px] transition-colors",
        active
          ? cn(BROWSER_CHROME_CHIP, "text-foreground")
          : cn("text-muted-foreground", BROWSER_CHROME_CHIP_HOVER, "hover:text-foreground"),
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
      >
        {tab.kind === "connector" && tab.connectorId ? (
          <ConnectorMark id={tab.connectorId} size="xs" className="!h-3.5 !w-3.5" />
        ) : (
          <FaviconImage
            url={tab.url}
            faviconUrl={tab.faviconUrl}
            size={14}
            className="shrink-0"
          />
        )}
        <span className="truncate font-medium">{tab.title}</span>
      </button>
      {canClose ? (
        <button
          type="button"
          aria-label={`Close ${tab.title}`}
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
        >
          <X className="h-3 w-3" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}

function ChromeBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <BrowserChromeTooltip label={label}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors disabled:opacity-40",
          BROWSER_CHROME_CHIP_HOVER,
          "hover:text-foreground",
        )}
      >
        {children}
      </button>
    </BrowserChromeTooltip>
  );
}
