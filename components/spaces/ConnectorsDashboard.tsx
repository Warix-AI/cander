"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ExternalLink, Pin, PinOff, Plus, Search, Unplug, X } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { useApp } from "@/components/app/AppProvider";
import { DashFrame, ScopeToggle } from "@/components/spaces/ItemSet";
import {
  CONNECTOR_CONTROL_RADIUS,
  SHELL_G3_RADIUS,
} from "@/lib/shell-chrome";
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
import { MobileFilterBar, useMobilePanelActionsState, type MobilePanelActionsConfig } from "@/components/shell/mobile/MobilePanelActions";
import { useMobileShell } from "@/lib/use-media-query";
import {
  attachWorkConnector,
  clearWorkConnectorAttach,
  detachWorkConnector,
  peekWorkConnectorAttach,
} from "@/lib/work-connectors";
import { connectionsForConnector } from "@/lib/workspace-connections";
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
  claimConnectorOAuthSession,
} from "@/lib/api/connector-client";
import { ConnectorDetailModal } from "@/components/connectors/ConnectorDetailModal";
import type { ConnectorConnection } from "@/lib/connectors/types";
import { isOauthConnectorId } from "@/lib/connectors/oauth-connectors";
import {
  appConnectorById,
} from "@/lib/connectors/apps/definitions";
import { invalidateConnectorViewCache } from "@/lib/connectors/view-session-cache";
import { isMobileShell } from "@/lib/mobile-shell";
import { setComposerPendingInput } from "@/lib/composer-seed";
import { getDataBackend } from "@/lib/data-backend";

const SECTION_ORDER = [
  "Featured",
  "Communication",
  "Productivity",
  "Engineering",
  "Commerce",
] as const;

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
    actor,
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
  const [, setInfo] = useState("");
  const [catalogView, setCatalogView] = useState<ConnectorsView>("connectors");
  const [searchOpen, setSearchOpen] = useState(false);
  const [workAttachFor, setWorkAttachFor] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [detailConnectorId, setDetailConnectorId] = useState<string | null>(null);
  const [connectionsLoading, setConnectionsLoading] = useState(
    () => getDataBackend() !== "local",
  );
  const searchRef = useRef<HTMLInputElement>(null);

  const accessibleWorkspaceIds = useMemo(
    () => Array.from(new Set([workspaceId, ...actor.workspaceIds])),
    [actor.workspaceIds, workspaceId],
  );
  const isLocalBackend = getDataBackend() === "local";

  useEffect(() => {
    let cancelled = false;
    if (getDataBackend() === "local") {
      return;
    }

    queueMicrotask(() => {
      if (!cancelled) setConnectionsLoading(true);
    });
    void Promise.allSettled(
      accessibleWorkspaceIds.map(async (id) => {
        const connections = await fetchConnectorConnections(id);
        replaceConnectorConnectionsForWorkspace(id, connections);
      }),
    ).finally(() => {
      if (!cancelled) setConnectionsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [accessibleWorkspaceIds]);

  useEffect(() => {
    setWorkAttachFor(peekWorkConnectorAttach());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const connector = params.get("connectors");
    const result = params.get("result");
    if (
      !result ||
      !connector ||
      (connector !== "gmail" &&
        connector !== "gcal" &&
        connector !== "gdrive" &&
        connector !== "gsheets" &&
        connector !== "gdocs" &&
        !isOauthConnectorId(connector))
    ) {
      return;
    }
    void fetchConnectorConnections(workspaceId)
      .then((connections) => {
        replaceConnectorConnectionsForWorkspace(workspaceId, connections);
        if (connector) {
          invalidateConnectorViewCache(connector, workspaceId);
        }
      })
      .catch(() => undefined);
    const label =
      connector === "gdrive"
        ? "Google Drive"
        : connector === "gsheets"
          ? "Google Sheets"
          : connector === "gdocs"
            ? "Google Docs"
            : connector === "gcal"
              ? "Google Calendar"
              : appConnectorById(connector)?.name ??
                (connector === "gmail" ? "Gmail" : connector);
    if (result === "success") {
      setInfo(`${label} connection updated. Refresh if status looks stale.`);
    } else if (result === "error") {
      setInfo(`${label} connection could not be completed. Try again.`);
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
        const localAccounts = isLocalBackend
          ? connectionsForConnector(workspaceId, item.id, workspace)
          : [];
        const pending = pendingConnectorIdsLive(workspaceId).includes(item.id);
        const liveConnected = accounts.length > 0 || localAccounts.length > 0;
        // OAuth connectors are only "installed" after a verified active connection.
        // Local catalog installs never fake Connected/Installed for Composio OAuth apps.
        const localInstall =
          !isOauthConnectorId(item.id) && installedIds.includes(item.id);
        const accountConnections = accessibleWorkspaceIds.flatMap((id) =>
          connectionsForConnectorLive(id, item.id).filter(
            (row) => row.status === "pending" || row.status === "active",
          ),
        );
        return {
          ...item,
          installed: liveConnected || localInstall,
          accountInstalled:
            liveConnected || localInstall || accountConnections.length > 0,
          accountConnections,
          pending,
          accounts,
          liveConnections,
        };
      }),
    [
      accessibleWorkspaceIds,
      connectionRevision,
      installedIds,
      isLocalBackend,
      workspace,
      workspaceId,
    ],
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
    const pendingOauth = appConnectorById(id)?.oauthReady === false;
    if (pendingOauth) {
      setInfo(
        `${appConnectorById(id)?.name ?? id} needs a custom Composio OAuth app before Connect works.`,
      );
      openConnectorDetail(id);
      return;
    }
    if (isOauthConnectorId(id)) {
      setInfo("");
      setDetailConnectorId(id);
      await proceedComposioOAuth(id);
      return;
    }
    installConnector(id);
    bindToWorkIfArmed(id);
    setDetailConnectorId(id);
    void refreshConnections();
  };

  const proceedComposioOAuth = async (id: string) => {
    const { openConnectorAuthorizationUrl } = await import(
      "@/lib/open-connector-oauth"
    );
    setConnectingId(id);
    try {
      const { authorizationUrl, connection } = await initiateConnectorConnection({
        workspaceId,
        connectorId: id,
      });
      patchConnectorConnectionForWorkspace(workspaceId, connection);
      if (authorizationUrl) {
        openConnectorAuthorizationUrl(authorizationUrl, {
          onExternalFinished: () => {
            void claimConnectorOAuthSession({ workspaceId })
              .then(async (claimed) => {
                if (claimed.claimed && claimed.connection) {
                  patchConnectorConnectionForWorkspace(
                    workspaceId,
                    claimed.connection,
                  );
                  setInfo(
                    `${appConnectorById(claimed.connectorId ?? id)?.name ?? "Connector"} connected.`,
                  );
                  if (claimed.connectorId) {
                    invalidateConnectorViewCache(claimed.connectorId, workspaceId);
                  }
                  return;
                }
                const connections = await fetchConnectorConnections(workspaceId);
                replaceConnectorConnectionsForWorkspace(workspaceId, connections);
              })
              .catch(() => undefined);
          },
        });
        const label = appConnectorById(id)?.name ?? id;
        try {
          await navigator.clipboard.writeText(authorizationUrl);
        } catch {
          // ignore clipboard failures
        }
        setInfo(
          isMobileShell()
            ? `Continue in the browser sheet to connect ${label}. Return here when finished — this window finishes automatically.`
            : `Finish ${label} in the browser that opened, then return here — this window completes the connection automatically.`,
        );
        const started = Date.now();
        const poll = window.setInterval(() => {
          void (async () => {
            try {
              const claimed = await claimConnectorOAuthSession({ workspaceId });
              if (claimed.claimed && claimed.connection) {
                window.clearInterval(poll);
                patchConnectorConnectionForWorkspace(
                  workspaceId,
                  claimed.connection,
                );
                setInfo(
                  `${appConnectorById(claimed.connectorId ?? id)?.name ?? label} connected.`,
                );
                if (claimed.connectorId) {
                  invalidateConnectorViewCache(claimed.connectorId, workspaceId);
                }
                return;
              }
            } catch {
              // keep polling
            }
            try {
              const connections = await fetchConnectorConnections(workspaceId);
              replaceConnectorConnectionsForWorkspace(workspaceId, connections);
              const active = connections.some(
                (row) => row.connectorId === id && row.status === "active",
              );
              if (active || Date.now() - started > 180_000) {
                window.clearInterval(poll);
                if (active) {
                  setInfo(`${label} connected.`);
                  invalidateConnectorViewCache(id, workspaceId);
                }
              }
            } catch {
              // ignore
            }
          })();
        }, 2000);
        const onVisible = () => {
          if (document.visibilityState !== "visible") return;
          void claimConnectorOAuthSession({ workspaceId }).catch(() => undefined);
        };
        document.addEventListener("visibilitychange", onVisible);
        window.setTimeout(() => {
          document.removeEventListener("visibilitychange", onVisible);
        }, 180_000);
        return;
      }
      setInfo(`Could not start ${id} authorization.`);
    } catch (err) {
      setInfo(
        err instanceof Error ? err.message : "Could not start connection.",
      );
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
    // The General catalog opens its own connector detail. Pinned connector
    // surfaces are separate destinations and should not intercept this flow.
    if (mobile) {
      openConnectorDetail(id);
      return;
    }
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

  const setPanelActions = useMobilePanelActionsState()?.setActions;
  const detailId = detailItem?.id ?? null;
  const detailName = detailItem?.name ?? "";
  const detailTier = detailId ? pinTier("connector", detailId) : null;
  const detailConnected = Boolean(
    detailItem?.liveConnections?.some((row) => row.status === "active"),
  );
  const detailBlocked = detailId ? blockedIds.includes(detailId) : false;

  useEffect(() => {
    if (!setPanelActions || !mobile || !detailId) return;

    const actions: NonNullable<
      MobilePanelActionsConfig["connector"]
    >["actions"] = [];
    if (detailTier) {
      actions.push({
        label: "Unpin",
        icon: PinOff,
        onClick: () => clearPin("connector", detailId),
      });
    } else {
      actions.push({
        label: "Pin",
        icon: Pin,
        onClick: () => setPin("connector", detailId, "primary"),
      });
    }
    actions.push({
      label: "Open",
      icon: ExternalLink,
      onClick: () => {
        openConnector(detailId);
        setDetailConnectorId(null);
      },
    });
    if (!detailBlocked) {
      actions.push({
        label: detailConnected ? "Disconnect" : "Uninstall",
        icon: Unplug,
        disabled:
          connectingId === detailId || disconnectingId === detailId,
        onClick: () => {
          void disconnectConnector(detailId);
        },
      });
    }
    setPanelActions({
      connector: {
        title: detailName,
        back: {
          label: "Connectors",
          onClick: () => setDetailConnectorId(null),
        },
        actions,
      },
    });
    return () => setPanelActions(null);
    // disconnectConnector is stable enough for click handlers; avoid re-binding every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- detail fields listed explicitly
  }, [
    setPanelActions,
    mobile,
    detailId,
    detailName,
    detailTier,
    detailConnected,
    detailBlocked,
    clearPin,
    setPin,
    openConnector,
    connectingId,
    disconnectingId,
  ]);

  const installed = apps.filter(
    (item) => item.accountInstalled && !blockedIds.includes(item.id),
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
      // Mobile: lead with the first featured connector’s name instead of “Featured”.
      const featuredTitle =
        mobile && featured[0]?.name ? featured[0].name : "Featured";
      groups.push({ title: featuredTitle, items: featured });
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
  }, [directory, catalogView, mobile]);

  return (
    <>
      {!detailItem ? (
        <DashFrame
          banner={false}
          title="Connectors"
          subtitle="Connect apps to your workspace."
        >
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
          scope={{
            value: catalogView,
            onChange: (value) => setCatalogView(value as ConnectorsView),
            options: [...connectorScopeOptions],
            label: "Catalog",
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
            glass
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
                  className={cn(
                    "h-10 w-full pr-9 pl-9 text-[13px] outline-none placeholder:text-muted-foreground focus:outline-none",
                    "bg-white/45 shadow-[0_8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:bg-white/[0.06] dark:shadow-[0_8px_24px_rgba(0,0,0,0.16)]",
                    CONNECTOR_CONTROL_RADIUS,
                  )}
                />
                <button
                  type="button"
                  aria-label="Close search"
                  onClick={() => {
                    setQuery("");
                    setSearchOpen(false);
                  }}
                  className={cn(
                    "absolute top-1/2 right-1.5 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center text-muted-foreground hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.1]",
                    CONNECTOR_CONTROL_RADIUS,
                  )}
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.6} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                aria-label="Search connectors"
                onClick={() => setSearchOpen(true)}
                className={cn(
                  "inline-flex h-10 w-12 shrink-0 items-center justify-center text-muted-foreground transition-colors duration-200 hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.1]",
                  "bg-white/45 shadow-[0_8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:bg-white/[0.06] dark:shadow-[0_8px_24px_rgba(0,0,0,0.16)]",
                  CONNECTOR_CONTROL_RADIUS,
                )}
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
              className={cn(
                "h-10 w-full pr-9 pl-9 text-[13px] outline-none placeholder:text-muted-foreground focus:outline-none",
                "bg-white/45 shadow-[0_8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:bg-white/[0.06] dark:shadow-[0_8px_24px_rgba(0,0,0,0.16)]",
                CONNECTOR_CONTROL_RADIUS,
              )}
            />
            <button
              type="button"
              aria-label="Close search"
              onClick={() => {
                setQuery("");
                setSearchOpen(false);
              }}
              className={cn(
                "absolute top-1/2 right-1.5 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center text-muted-foreground hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.1]",
                CONNECTOR_CONTROL_RADIUS,
              )}
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.6} />
            </button>
          </div>
        ) : null}

        {connectionsLoading && catalogView === "installed" ? (
          <p className="mt-10 text-[13px] text-muted-foreground">
            Loading installed connectors…
          </p>
        ) : sections.length ? (
          sections.map((section) => {
            return (
              <section key={section.title} className="mt-10">
                {catalogView === "connectors" ? (
                  <h2 className="text-[15px] font-medium tracking-[-0.02em]">
                    {section.title}
                  </h2>
                ) : null}
                <div
                  className={cn(
                    "grid grid-cols-1 gap-y-0.5",
                    catalogView === "connectors" ? "mt-4" : "mt-0",
                  )}
                >
                  {section.items.map((item) => (
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
      ) : null}
      {detailItem ? (
        <ConnectorDetailModal
        open={Boolean(detailItem)}
        onClose={() => setDetailConnectorId(null)}
        dedicated
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
    accountInstalled?: boolean;
    accountConnections?: ConnectorConnection[];
  };
  active: boolean;
  blocked?: boolean;
  connecting?: boolean;
  disconnecting?: boolean;
  onOpen: () => void;
  onConnect: () => void;
}) {
  const isConnected = item.liveConnections?.some((row) => row.status === "active");
  const hasCurrentPending = item.liveConnections?.some(
    (row) => row.status === "pending",
  );
  const connectedElsewhere =
    !isConnected &&
    !hasCurrentPending &&
    item.accountConnections?.some((row) => row.status === "active");
  const isOauth = isOauthConnectorId(item.id);
  const oauthPending = appConnectorById(item.id)?.oauthReady === false;

  const statusLabel = item.pending
    ? "Connecting"
    : isConnected
      ? "Connected"
      : connectedElsewhere
        ? "Connected in another workspace"
      : oauthPending
        ? "Coming soon"
        : !isOauth && item.installed
          ? "Installed"
          : null;

  return (
    <div
      className={cn(
        "flex w-full items-center gap-3 bg-transparent px-3 py-3 transition-[background-color,box-shadow] duration-200",
        SHELL_G3_RADIUS,
        "hover:bg-black/[0.06] hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:hover:bg-white/[0.08] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.14)]",
        (disconnecting || connecting) && "opacity-60",
        active && "bg-black/[0.04] dark:bg-white/[0.05]",
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
                    ? "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400"
                    : item.pending
                      ? "bg-chart-3/10 text-chart-3"
                      : "bg-muted/70 text-muted-foreground",
                )}
              >
                {statusLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[12px] leading-snug text-muted-foreground">
            {item.pending
              ? "Authorization in progress — finish connecting to activate."
              : oauthPending
                ? "Custom OAuth setup required before Connect works."
                : item.description}
          </p>
        </div>
      </button>
      <div className="flex shrink-0 items-center self-center">
        {isConnected ||
        item.pending ||
        oauthPending ||
        (!isOauth && item.installed) ? null : (
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
