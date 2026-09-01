"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { MoreHorizontal, Search, X } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { useApp } from "@/components/app/AppProvider";
import { DashFrame, ScopeToggle } from "@/components/spaces/ItemSet";
import { FLOAT_ICON_BUTTON } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";
import { Dropdown } from "@/components/ui/Controls";
import {
  getInstalledConnectorsServerSnapshot,
  getInstalledConnectorsSnapshot,
  installConnector,
  subscribeInstalledConnectors,
  uninstallConnector,
} from "@/lib/connector-install";
import { connectors as seed } from "@/lib/data";
import type { Connector, PinTier } from "@/lib/types";
import { blockedConnectorIds } from "@/lib/workspace-policy";
import { MobileFilterBar } from "@/components/shell/mobile/MobilePanelActions";
import { useMobileShell } from "@/lib/use-media-query";
import {
  attachWorkConnector,
  clearWorkConnectorAttach,
  detachWorkConnector,
  peekWorkConnectorAttach,
} from "@/lib/work-connectors";
import {
  activeAccountsForConnector,
  connectionsForConnectorLive,
  getConnectorConnectionsServerSnapshot,
  getConnectorConnectionsSnapshot,
  pendingConnectorIdsLive,
  replaceConnectorConnectionsForWorkspace,
  subscribeConnectorConnections,
} from "@/lib/connector-connections-store";
import {
  disconnectConnectorConnection,
  fetchConnectorConnections,
  initiateConnectorConnection,
} from "@/lib/api/connector-client";

const SECTION_ORDER = [
  "Featured",
  "Productivity",
  "Engineering",
  "Data",
  "Communication",
  "Commerce",
  "Internal",
] as const;

const PREVIEW_ROWS = 6;

const connectorScopeOptions = [
  { id: "connectors", label: "Connectors" },
  { id: "installed", label: "Installed" },
] as const;

type ConnectorsView = "connectors" | "installed";

export function ConnectorsDashboard() {
  const {
    connectorId,
    openConnector,
    workspaceId,
    workspace,
    workspacePolicies,
    billingPlan,
    pinTier,
    setPin,
    clearPin,
    newChat,
    mobileSurface,
    view: appView,
  } = useApp();
  const mobile = useMobileShell();
  const hoistFilters =
    mobile && appView === "space" && mobileSurface === "panel";
  const installedIds = useSyncExternalStore(
    subscribeInstalledConnectors,
    getInstalledConnectorsSnapshot,
    getInstalledConnectorsServerSnapshot,
  );
  const connectionRevision = useSyncExternalStore(
    subscribeConnectorConnections,
    getConnectorConnectionsSnapshot,
    getConnectorConnectionsServerSnapshot,
  );
  const [query, setQuery] = useState("");
  const [info, setInfo] = useState("");
  const [catalogView, setCatalogView] = useState<ConnectorsView>("connectors");
  const [searchOpen, setSearchOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [workAttachFor, setWorkAttachFor] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setWorkAttachFor(peekWorkConnectorAttach());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const connector = params.get("connectors");
    const result = params.get("result");
    if (connector !== "gmail" || !result) return;
    void fetchConnectorConnections(workspaceId)
      .then((connections) => {
        replaceConnectorConnectionsForWorkspace(workspaceId, connections);
      })
      .catch(() => undefined);
    if (result === "success") {
      setInfo("Gmail connection updated. Refresh if status looks stale.");
    } else if (result === "error") {
      setInfo("Gmail connection could not be completed. Try again.");
    }
    window.history.replaceState({}, "", window.location.pathname);
  }, [workspaceId]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const blockedIds = blockedConnectorIds(
    workspaceId,
    workspacePolicies,
    billingPlan,
  );

  const apps = useMemo(
    () =>
      seed.map((item) => {
        const liveConnections = connectionsForConnectorLive(workspaceId, item.id).filter(
          (row) => row.status === "pending" || row.status === "active",
        );
        const accounts = activeAccountsForConnector(workspaceId, item.id);
        const pending = pendingConnectorIdsLive(workspaceId).includes(item.id);
        const liveConnected = accounts.length > 0;
        const mockInstalled = installedIds.includes(item.id) && item.id !== "gmail";
        return {
          ...item,
          installed: liveConnected || mockInstalled,
          pending,
          accounts,
          liveConnections,
        };
      }),
    [installedIds, connectionRevision, workspaceId],
  );

  const bindToWorkIfArmed = (id: string) => {
    const target = peekWorkConnectorAttach();
    if (!target) return;
    attachWorkConnector(target, id);
    clearWorkConnectorAttach();
    setWorkAttachFor(null);
  };

  const connectConnector = async (id: string) => {
    if (blockedIds.includes(id)) return;
    if (id === "gmail") {
      setInfo("");
      try {
        const { authorizationUrl } = await initiateConnectorConnection({
          workspaceId,
          connectorId: id,
        });
        const connections = await fetchConnectorConnections(workspaceId);
        replaceConnectorConnectionsForWorkspace(workspaceId, connections);
        if (authorizationUrl) {
          window.location.assign(authorizationUrl);
          return;
        }
        setInfo("Could not start Gmail authorization.");
      } catch (err) {
        setInfo(
          err instanceof Error ? err.message : "Could not start connection.",
        );
      }
      return;
    }
    installConnector(id);
    bindToWorkIfArmed(id);
    openConnector(id);
  };

  const selectConnector = (id: string) => {
    if (workAttachFor) {
      if (id === "gmail") {
        void connectConnector(id);
        return;
      }
      installConnector(id);
      bindToWorkIfArmed(id);
    }
    openConnector(id);
  };

  const disconnectConnector = async (id: string) => {
    const item = apps.find((entry) => entry.id === id);
    if (!item) return;
    setInfo("");
    setDisconnectingId(id);
    try {
      if (item.liveConnections.length > 0) {
        for (const connection of item.liveConnections) {
          await disconnectConnectorConnection({
            workspaceId,
            connectionId: connection.id,
          });
        }
        const connections = await fetchConnectorConnections(workspaceId);
        replaceConnectorConnectionsForWorkspace(workspaceId, connections);
        detachWorkConnector(workspaceId, id);
        setInfo(`${item.name} disconnected and provider access revoked.`);
      }
      uninstallConnector(id);
    } catch (err) {
      setInfo(
        err instanceof Error ? err.message : "Could not disconnect connector.",
      );
    } finally {
      setDisconnectingId(null);
    }
  };


  const installed = apps.filter(
    (item) => item.installed && !blockedIds.includes(item.id),
  );

  const needle = query.trim().toLowerCase();
  const directory = useMemo(() => {
    const pool = catalogView === "installed" ? installed : apps;
    return pool.filter((item) => {
      if (blockedIds.includes(item.id)) return false;
      if (!needle) return true;
      return (
        item.name.toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle) ||
        item.category.toLowerCase().includes(needle)
      );
    });
  }, [apps, blockedIds, installed, needle, catalogView]);

  const sections = useMemo(() => {
    if (catalogView === "installed") {
      return directory.length
        ? [{ title: "Installed", items: directory }]
        : [];
    }
    const featured = directory.filter((item) => item.featured);
    const featuredIds = new Set(featured.map((item) => item.id));
    const groups: { title: string; items: Connector[] }[] = [];
    if (featured.length) {
      groups.push({ title: "Featured", items: featured });
    }
    for (const title of SECTION_ORDER) {
      if (title === "Featured") continue;
      const items = directory.filter(
        (item) =>
          item.category === title && !featuredIds.has(item.id),
      );
      if (items.length) groups.push({ title, items });
    }
    const leftover = directory.filter(
      (item) =>
        !featuredIds.has(item.id) &&
        !SECTION_ORDER.includes(
          item.category as (typeof SECTION_ORDER)[number],
        ),
    );
    if (leftover.length) groups.push({ title: "More", items: leftover });
    return groups;
  }, [directory, catalogView]);

  return (
    <DashFrame
      banner={false}
      title="Connectors"
      subtitle="Connect apps to your workspace."
    >
        {info ? (
          <p className="mb-4 rounded-[10px] border border-border bg-muted/40 px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
            {info}
          </p>
        ) : null}
        {workAttachFor ? (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-border bg-muted/50 px-4 py-3">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Adding to Work.</span>{" "}
              Install or open a connector — it attaches to Work and starts
              feeding Today, Inbox, and the rest.
            </p>
            <button
              type="button"
              onClick={() => {
                clearWorkConnectorAttach();
                setWorkAttachFor(null);
              }}
              className="shrink-0 text-[12.5px] font-medium text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        ) : null}

        <MobileFilterBar
          active={hoistFilters}
          onNewChat={() => newChat()}
          newChatLabel="New chat"
          scope={{
            value: catalogView,
            onChange: (value) => setCatalogView(value as ConnectorsView),
            options: [...connectorScopeOptions],
          }}
          extras={[
            {
              id: "search",
              label: searchOpen ? "Close search" : "Search",
              active: searchOpen,
              onClick: () => setSearchOpen((open) => !open),
            },
          ]}
        >
          <ScopeToggle
            wrap
            value={catalogView}
            onChange={(value) => setCatalogView(value as ConnectorsView)}
            options={[...connectorScopeOptions]}
          />
          <div className="flex min-w-0 items-center justify-end gap-1 @min-[420px]:ml-auto @min-[420px]:flex-1">
            {searchOpen ? (
              <div className="relative w-full max-w-[22rem] transition-[max-width] duration-200">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                  strokeWidth={1.6}
                />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setQuery("");
                      setSearchOpen(false);
                    }
                  }}
                  placeholder="Search"
                  className="h-10 w-full rounded-[10px] border border-border bg-background pr-9 pl-9 text-[13px] outline-none placeholder:text-muted-foreground focus:border-foreground/20"
                />
                <button
                  type="button"
                  aria-label="Close search"
                  onClick={() => {
                    setQuery("");
                    setSearchOpen(false);
                  }}
                  className="absolute top-1/2 right-1.5 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.6} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                aria-label="Search connectors"
                onClick={() => setSearchOpen(true)}
                className={cn(FLOAT_ICON_BUTTON, "text-muted-foreground hover:text-foreground")}
              >
                <Search className="h-4 w-4" strokeWidth={1.6} />
              </button>
            )}
          </div>
        </MobileFilterBar>

        {searchOpen ? (
          <div className="relative mb-4 lg:hidden">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.6}
            />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setQuery("");
                  setSearchOpen(false);
                }
              }}
              placeholder="Search connectors"
              className="h-10 w-full rounded-[10px] border border-border bg-background pr-9 pl-9 text-[13px] outline-none placeholder:text-muted-foreground focus:border-foreground/20"
            />
            <button
              type="button"
              aria-label="Close search"
              onClick={() => {
                setQuery("");
                setSearchOpen(false);
              }}
              className="absolute top-1/2 right-1.5 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.6} />
            </button>
          </div>
        ) : null}

        {sections.length ? (
          sections.map((section) => {
            const open = expanded[section.title] || Boolean(needle) || catalogView === "installed";
            const visible = open
              ? section.items
              : section.items.slice(0, PREVIEW_ROWS);
            const rest = section.items.slice(PREVIEW_ROWS);
            return (
              <section key={section.title} className="mt-10">
                {catalogView === "connectors" ? (
                  <h2 className="text-[15px] font-medium tracking-[-0.02em]">
                    {section.title}
                  </h2>
                ) : null}
                <div
                  className={cn(
                    "grid grid-cols-1 gap-x-8 gap-y-3 @min-[440px]:grid-cols-2",
                    catalogView === "connectors" ? "mt-4" : "mt-0",
                  )}
                >
                  {visible.map((item) => (
                    <DirectoryItem
                      key={item.id}
                      item={item}
                      active={connectorId === item.id}
                      tier={pinTier("connector", item.id)}
                      disconnecting={disconnectingId === item.id}
                      onOpen={() => selectConnector(item.id)}
                      onInstall={() => void connectConnector(item.id)}
                      onUninstall={() => void disconnectConnector(item.id)}
                      onSetPin={() => setPin("connector", item.id, "primary")}
                      onClearPin={() => clearPin("connector", item.id)}
                      workAttach={Boolean(workAttachFor)}
                    />
                  ))}
                </div>
                {rest.length && !open ? (
                  <SeeMore
                    rest={rest}
                    onExpand={() =>
                      setExpanded((current) => ({
                        ...current,
                        [section.title]: true,
                      }))
                    }
                  />
                ) : null}
              </section>
            );
          })
        ) : (
          <p className="mt-10 text-[13px] text-muted-foreground">
            {catalogView === "installed"
              ? "No connectors installed yet."
              : "No connectors match that search."}
          </p>
        )}
    </DashFrame>
  );
}

function DirectoryItem({
  item,
  active,
  tier,
  disconnecting,
  onOpen,
  onInstall,
  onUninstall,
  onSetPin,
  onClearPin,
  workAttach,
}: {
  item: Connector & {
    pending?: boolean;
    liveConnections?: { id: string; status: string }[];
  };
  active: boolean;
  tier: PinTier | null;
  disconnecting?: boolean;
  onOpen: () => void;
  onInstall: () => void;
  onUninstall: () => void;
  onSetPin: () => void;
  onClearPin: () => void;
  workAttach?: boolean;
}) {
  const pinned = Boolean(tier);
  const hasServerConnection = Boolean(item.liveConnections?.length);
  const showActionsMenu =
    !workAttach && (item.installed || item.pending || hasServerConnection);
  const disconnectLabel = hasServerConnection ? "Disconnect" : "Uninstall";

  const actionsMenu = (
    <Dropdown
      align="end"
      menuClassName="min-w-[9.5rem]"
      matchTrigger={false}
      trigger={({ toggle }) => (
        <button
          type="button"
          aria-label={`More for ${item.name}`}
          onClick={toggle}
          disabled={disconnecting}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <MoreHorizontal className="h-4 w-4" strokeWidth={1.6} />
        </button>
      )}
    >
      {(close) => (
        <>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              onOpen();
            }}
            className="flex w-full rounded-[10px] px-3 py-2 text-left text-[13px] hover:bg-muted"
          >
            Open
          </button>
          {item.installed && !item.pending ? (
            !pinned ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  onSetPin();
                }}
                className="flex w-full rounded-[10px] px-3 py-2 text-left text-[13px] hover:bg-muted"
              >
                Pin
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  onClearPin();
                }}
                className="flex w-full rounded-[10px] px-3 py-2 text-left text-[13px] hover:bg-muted"
              >
                Unpin
              </button>
            )
          ) : null}
          <button
            type="button"
            role="menuitem"
            disabled={disconnecting}
            onClick={() => {
              close();
              onUninstall();
            }}
            className="flex w-full rounded-[10px] px-3 py-2 text-left text-[13px] text-destructive hover:bg-muted disabled:opacity-50"
          >
            {disconnectLabel}
          </button>
        </>
      )}
    </Dropdown>
  );

  return (
    <div
      className="canvas-hover flex items-start gap-2.5 rounded-[10px] py-2"
      data-active={active ? "true" : undefined}
    >
      <button type="button" onClick={onOpen} className="mt-0.5 shrink-0">
        <ConnectorMark id={item.icon} size="sm" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-1.5">
          <button
            type="button"
            onClick={onOpen}
            className="min-w-0 truncate text-left text-[13px] font-medium tracking-[-0.02em]"
          >
            {item.name}
          </button>
          {item.installed ? (
            workAttach ? (
              <button
                type="button"
                onClick={onOpen}
                className="inline-flex h-7 shrink-0 items-center rounded-full border border-foreground/15 px-2.5 text-[11.5px] font-medium tracking-[-0.01em] hover:bg-muted"
              >
                Add to Work
              </button>
            ) : showActionsMenu ? (
              actionsMenu
            ) : (
              <span className="inline-flex h-7 shrink-0 items-center px-1 text-[11.5px] font-medium tracking-[-0.01em] text-muted-foreground">
                Connected
              </span>
            )
          ) : item.pending || hasServerConnection ? (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={onInstall}
                disabled={disconnecting}
                className="inline-flex h-7 items-center rounded-full border border-foreground/15 px-2.5 text-[11.5px] font-medium tracking-[-0.01em] hover:bg-muted disabled:opacity-50"
              >
                Continue connecting
              </button>
              {actionsMenu}
            </div>
          ) : (
            <button
              type="button"
              onClick={onInstall}
              className="inline-flex h-7 shrink-0 items-center rounded-full border border-foreground/15 px-2.5 text-[11.5px] font-medium tracking-[-0.01em] hover:bg-muted"
            >
              {workAttach
                ? "Add to Work"
                : item.pending
                  ? "Continue connecting"
                  : item.id === "gmail"
                    ? "Connect"
                    : "Install"}
            </button>
          )}
        </div>
        <p className="mt-0.5 truncate text-[12px] leading-snug text-muted-foreground">
          {item.pending
            ? "Authorization in progress — finish connecting to activate."
            : item.description}
        </p>
      </div>
    </div>
  );
}

function SeeMore({
  rest,
  onExpand,
}: {
  rest: Connector[];
  onExpand: () => void;
}) {
  const preview = rest.slice(0, 3);
  const names = preview.map((item) => item.name);
  const extra = rest.length - names.length;
  const label =
    extra > 0
      ? `See ${names.slice(0, 2).join(", ")}, and ${rest.length} more.`
      : `See ${names.join(" and ")}.`;

  return (
    <button
      type="button"
      onClick={onExpand}
      className="mt-3 inline-flex items-center gap-2 text-[13px] text-muted-foreground transition-colors duration-200 hover:text-foreground"
    >
      <span className="flex items-center">
        {preview.map((item, index) => (
          <span
            key={item.id}
            className={cn("relative", index > 0 && "-ml-1.5")}
            style={{ zIndex: preview.length - index }}
          >
            <ConnectorMark
              id={item.icon}
              size="xs"
              className="ring-2 ring-background"
            />
          </span>
        ))}
      </span>
      {label}
    </button>
  );
}
