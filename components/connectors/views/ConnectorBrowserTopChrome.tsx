"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Plus, X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { BrowserChromeTooltip } from "@/components/browser/BrowserChromeTooltip";
import { FaviconImage } from "@/components/browser/FaviconImage";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import {
  PanelToggle,
  clearBrowserChromeHovers,
} from "@/components/shell/PanelToggle";
import { CONNECTOR_CATALOG } from "@/lib/api/connector-catalog";
import { connectorAccountTabLabel } from "@/lib/connectors/account-names";
import { isUiConnectedStatus } from "@/lib/connectors/authz";
import {
  connectionsForConnectorLive,
  getConnectorConnectionsServerSnapshot,
  getConnectorConnectionsSnapshot,
  subscribeConnectorConnections,
} from "@/lib/connector-connections-store";
import {
  getConnectorActiveAccountServerSnapshot,
  getConnectorActiveAccountSnapshot,
  resolveActiveConnectorAccount,
  subscribeConnectorActiveAccount,
} from "@/lib/connector-active-account";
import {
  connectorBrowserStorageKey,
  getConnectorBrowserSession,
  makeConnectorWebTab,
  setConnectorBrowserSession,
  subscribeConnectorBrowserSession,
  type ConnectorBrowserSession,
  type ConnectorBrowserTab,
} from "@/lib/connector-browser-session";
import {
  BROWSER_CHROME_CHIP_HOVER,
  SHELL_G3_RADIUS,
  useShellStyle,
} from "@/lib/shell-chrome";
import {
  SIDEBAR_ROW_HOVER,
  SIDEBAR_SEGMENT_ACTIVE,
} from "@/lib/mobile-menu-styles";
import { cn } from "@/lib/utils";

function sessionSnapshot(
  key: string,
  connectorId: string,
  title: string,
): ConnectorBrowserSession {
  return getConnectorBrowserSession(key, connectorId, title);
}

function panelSurface(floating: boolean) {
  return floating ? "bg-transparent" : "bg-white dark:bg-space-canvas";
}

/**
 * Full-width connector tab strip — chat collapse · tabs · right panel.
 * Rendered above chat + app so the bottom connector chrome can stay on the right.
 */
export function ConnectorBrowserTopChrome({
  connectorId,
  className,
}: {
  connectorId: string;
  className?: string;
}) {
  const {
    workspaceId,
    actor,
    drafting,
    thread,
    shellPanelCycleStep,
    expandedLayout,
  } = useApp();
  const floating = useShellStyle() === "floating";
  const surface = panelSurface(floating);
  const catalog = CONNECTOR_CATALOG.find((item) => item.id === connectorId);
  const connectorTitle = catalog?.name ?? connectorId;

  useSyncExternalStore(
    subscribeConnectorConnections,
    getConnectorConnectionsSnapshot,
    getConnectorConnectionsServerSnapshot,
  );
  useSyncExternalStore(
    subscribeConnectorActiveAccount,
    getConnectorActiveAccountSnapshot,
    getConnectorActiveAccountServerSnapshot,
  );

  const activeAccount = resolveActiveConnectorAccount(
    workspaceId,
    connectorId,
    connectionsForConnectorLive(workspaceId, connectorId),
    isUiConnectedStatus,
  );
  const title = connectorAccountTabLabel(
    activeAccount?.displayName,
    connectorTitle,
  );
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

  return (
    <div
      className={cn(
        "hidden h-[45px] min-w-0 shrink-0 items-center gap-1 px-1 lg:flex",
        // Detached chrome floats on the canvas — no island fill / divider.
        floating
          ? "bg-transparent"
          : cn(
              surface,
              "border-b border-black/[0.035] px-2 dark:border-white/[0.06]",
            ),
        className,
      )}
      onPointerLeave={clearBrowserChromeHovers}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-visible">
        {session.tabs.map((tab) => (
          <ConnectorTopTabButton
            key={tab.id}
            tab={tab}
            active={tab.id === active.id}
            onSelect={() => selectTab(tab.id)}
            onClose={() => closeTab(tab.id)}
            accountIconUrl={
              tab.kind === "connector" ? activeAccount?.iconUrl : null
            }
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
        <BrowserChromeTooltip
          label={
            shellPanelCycleStep === 1
              ? "Open chat"
              : shellPanelCycleStep === 2
                ? "Close panels"
                : shellPanelCycleStep === 3
                  ? "Open panels"
                  : chatArmed && !expandedLayout
                    ? "Close chat"
                    : "Close panels"
          }
        >
          <PanelToggle />
        </BrowserChromeTooltip>
      </span>
    </div>
  );
}

function ConnectorTopTabButton({
  tab,
  active,
  onSelect,
  onClose,
  accountIconUrl,
}: {
  tab: ConnectorBrowserTab;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
  accountIconUrl?: string | null;
}) {
  const floating = useShellStyle() === "floating";
  const canClose = !tab.pinned && tab.kind !== "connector";
  return (
    <div
      className={cn(
        // Match Apps / Experts / Chats segment height + radius.
        "group relative flex min-w-[4.5rem] max-w-[10.5rem] shrink-0 items-center gap-1.5 px-2 py-2 text-[12px] tracking-[-0.01em] transition-[background-color,box-shadow,color,backdrop-filter] duration-150",
        SHELL_G3_RADIUS,
        active
          ? cn(
              SIDEBAR_SEGMENT_ACTIVE,
              floating && "shell-segment-on-canvas",
              "text-foreground",
            )
          : cn(
              "text-muted-foreground",
              SIDEBAR_ROW_HOVER,
              "hover:text-foreground",
            ),
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
      >
        {tab.kind === "connector" && tab.connectorId ? (
          accountIconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={accountIconUrl}
              alt=""
              draggable={false}
              className="h-3.5 w-3.5 shrink-0 rounded-full object-cover"
            />
          ) : (
            <ConnectorMark
              id={tab.connectorId}
              size="xs"
              className="!h-3.5 !w-3.5"
            />
          )
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
