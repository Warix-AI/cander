"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Plus, Search, X } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { useApp } from "@/components/app/AppProvider";
import { DashFrame, ScopeToggle } from "@/components/spaces/ItemSet";
import { FLOAT_ICON_BUTTON, SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";
import {
  getInstalledConnectorsServerSnapshot,
  getInstalledConnectorsSnapshot,
  installConnector,
  subscribeInstalledConnectors,
  uninstallConnector,
} from "@/lib/connector-install";
import { connectors as seed } from "@/lib/data";
import type { Connector } from "@/lib/types";
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
  patchConnectorConnectionForWorkspace,
  subscribeConnectorConnections,
} from "@/lib/connector-connections-store";
import {
  disconnectConnectorConnection,
  fetchConnectorConnections,
  initiateConnectorConnection,
} from "@/lib/api/connector-client";
import { ConnectorDetailModal } from "@/components/connectors/ConnectorDetailModal";
import { ComposioConsentModal } from "@/components/connectors/ComposioConsentModal";
import type { ConnectorConnection } from "@/lib/connectors/types";
import { isOauthConnectorId } from "@/lib/connectors/oauth-connectors";
import { setComposerPendingInput } from "@/lib/composer-seed";

const SECTION_ORDER = [
  "Featured",
  "Communication",
  "Productivity",
  "Engineering",
  "Commerce",
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
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [detailConnectorId, setDetailConnectorId] = useState<string | null>(null);
  const [consentConnectorId, setConsentConnectorId] = useState<string | null>(
    null,
  );
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
    if (isOauthConnectorId(id)) {
      setInfo("");
      setConsentConnectorId(id);
      return;
    }
    installConnector(id);
    bindToWorkIfArmed(id);
    openConnector(id);
  };

  const proceedComposioOAuth = async () => {
    const id = consentConnectorId;
    if (!id) return;
    setConnectingId(id);
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
      setInfo(`Could not start ${id} authorization.`);
      setConsentConnectorId(null);
    } catch (err) {
      setInfo(
        err instanceof Error ? err.message : "Could not start connection.",
      );
      setConsentConnectorId(null);
    } finally {
      setConnectingId(null);
    }
  };

  const openConnectorDetail = (id: string) => {
    if (workAttachFor && !isOauthConnectorId(id)) {
      installConnector(id);
      bindToWorkIfArmed(id);
    }
    setDetailConnectorId(id);
    void refreshConnections();
  };

  const selectConnector = (id: string) => {
    openConnectorDetail(id);
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
      if (detailConnectorId === id) {
        setDetailConnectorId(null);
      }
    } catch (err) {
      setInfo(
        err instanceof Error ? err.message : "Could not disconnect connector.",
      );
    } finally {
      setDisconnectingId(null);
    }
  };

  const refreshConnections = async () => {
    const connections = await fetchConnectorConnections(workspaceId);
    replaceConnectorConnectionsForWorkspace(workspaceId, connections);
  };

  const detailItem = detailConnectorId
    ? apps.find((entry) => entry.id === detailConnectorId) ?? null
    : null;


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
    <>
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
                    "grid grid-cols-1 gap-x-6 gap-y-0.5 @min-[440px]:grid-cols-2",
                    catalogView === "connectors" ? "mt-4" : "mt-0",
                  )}
                >
                  {visible.map((item) => (
                    <DirectoryItem
                      key={item.id}
                      item={item}
                      active={connectorId === item.id}
                      blocked={blockedIds.includes(item.id)}
                      connecting={connectingId === item.id}
                      disconnecting={disconnectingId === item.id}
                      onOpen={() => selectConnector(item.id)}
                      onConnect={() => selectConnector(item.id)}
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
    {detailItem ? (
      <ConnectorDetailModal
        open={Boolean(detailItem)}
        onClose={() => setDetailConnectorId(null)}
        item={detailItem}
        workspaceId={workspaceId}
        blocked={blockedIds.includes(detailItem.id)}
        busy={
          connectingId === detailItem.id || disconnectingId === detailItem.id
        }
        tier={pinTier("connector", detailItem.id)}
        workAttach={Boolean(workAttachFor)}
        onConnect={async () => {
          await connectConnector(detailItem.id);
        }}
        onDisconnect={async () => {
          await disconnectConnector(detailItem.id);
        }}
        onOpen={() => {
          openConnector(detailItem.id);
          setDetailConnectorId(null);
        }}
        onConnectionsRefresh={() => {
          void refreshConnections();
        }}
        onSkillPermissionsUpdated={(updated) => {
          patchConnectorConnectionForWorkspace(workspaceId, updated);
        }}
        onSetPin={() => setPin("connector", detailItem.id, "primary")}
        onClearPin={() => clearPin("connector", detailItem.id)}
        onPromptSelect={(text) => {
          setComposerPendingInput({ text, source: "quick-ask" });
          newChat();
        }}
      />
    ) : null}
    <ComposioConsentModal
      open={Boolean(consentConnectorId)}
      connectorName={
        apps.find((entry) => entry.id === consentConnectorId)?.name
      }
      busy={connectingId === consentConnectorId}
      onClose={() => setConsentConnectorId(null)}
      onProceed={proceedComposioOAuth}
    />
    </>
  );
}

function DirectoryItem({
  item,
  active,
  blocked,
  connecting,
  disconnecting,
  onOpen,
  onConnect,
}: {
  item: Connector & {
    pending?: boolean;
    liveConnections?: ConnectorConnection[];
    installed?: boolean;
  };
  active: boolean;
  blocked?: boolean;
  connecting?: boolean;
  disconnecting?: boolean;
  onOpen: () => void;
  onConnect: () => void;
}) {
  const hasServerConnection = Boolean(item.liveConnections?.length);
  const isConnected = item.liveConnections?.some((row) => row.status === "active");

  const statusLabel = item.pending
    ? "Connecting"
    : isConnected
      ? "Connected"
      : item.installed || hasServerConnection
        ? "Installed"
        : null;

  return (
    <div
      className={cn(
        "flex w-full items-center gap-3 px-2 py-2 transition-colors duration-200",
        SHELL_G3_RADIUS,
        "hover:bg-muted/70",
        (disconnecting || connecting) && "opacity-60",
        active && "bg-muted/50",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={disconnecting}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <ConnectorMark
          id={item.icon}
          size="sm"
          className="!h-[2.3rem] !w-[2.3rem] shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-[13px] font-medium tracking-[-0.02em]">
              {item.name}
            </p>
            {statusLabel ? (
              <span
                className={cn(
                  "inline-flex h-5 shrink-0 items-center px-1.5 text-[10px] font-medium tracking-[-0.01em]",
                  SHELL_G3_RADIUS,
                  isConnected
                    ? "border border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : item.pending
                      ? "border border-chart-3/30 bg-chart-3/10 text-chart-3"
                      : "border border-border bg-muted text-muted-foreground",
                )}
              >
                {statusLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[12px] leading-snug text-muted-foreground">
            {item.pending
              ? "Authorization in progress — finish connecting to activate."
              : item.description}
          </p>
        </div>
      </button>
      <div className="flex shrink-0 items-center self-center">
        {isConnected || statusLabel === "Installed" || item.pending ? null : (
          <button
            type="button"
            aria-label={
              isOauthConnectorId(item.id)
                ? `Configure ${item.name}`
                : `Install ${item.name}`
            }
            disabled={blocked || connecting || disconnecting}
            onClick={(event) => {
              event.stopPropagation();
              onConnect();
            }}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
              SHELL_G3_RADIUS,
            )}
          >
            <Plus className="h-4 w-4" strokeWidth={1.8} />
          </button>
        )}
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
