"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { MoreHorizontal, Search, X } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { useApp } from "@/components/app/AppProvider";
import { DashFrame, ScopeToggle } from "@/components/spaces/ItemSet";
import { Dropdown } from "@/components/ui/Controls";
import {
  getInstalledConnectorsServerSnapshot,
  getInstalledConnectorsSnapshot,
  installConnector,
  subscribeInstalledConnectors,
  uninstallConnector,
} from "@/lib/connector-install";
import { connectors as seed } from "@/lib/data";
import type { Connector } from "@/lib/types";
import { cn } from "@/lib/utils";
import { blockedConnectorIds } from "@/lib/workspace-policy";
import {
  attachWorkConnector,
  clearWorkConnectorAttach,
  peekWorkConnectorAttach,
} from "@/lib/work-connectors";
import {
  connectionsForConnector,
  getWorkspaceConnectionsServerSnapshot,
  getWorkspaceConnectionsSnapshot,
  subscribeWorkspaceConnections,
} from "@/lib/workspace-connections";

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

type ConnectorsView = "connectors" | "installed";

export function ConnectorsDashboard() {
  const {
    connectorId,
    openConnector,
    workspaceId,
    workspace,
    workspacePolicies,
    billingPlan,
    isPinned,
    togglePin,
  } = useApp();
  const installedIds = useSyncExternalStore(
    subscribeInstalledConnectors,
    getInstalledConnectorsSnapshot,
    getInstalledConnectorsServerSnapshot,
  );
  const workspaceConnections = useSyncExternalStore(
    subscribeWorkspaceConnections,
    getWorkspaceConnectionsSnapshot,
    getWorkspaceConnectionsServerSnapshot,
  );
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ConnectorsView>("connectors");
  const [searchOpen, setSearchOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [workAttachFor, setWorkAttachFor] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setWorkAttachFor(peekWorkConnectorAttach());
  }, []);

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
        const accounts = connectionsForConnector(
          workspaceId,
          item.id,
          workspace,
        );
        const installed =
          item.installed ||
          installedIds.includes(item.id) ||
          accounts.length > 0;
        return {
          ...item,
          installed,
          accounts,
        };
      }),
    [installedIds, workspace, workspaceConnections, workspaceId],
  );

  const bindToWorkIfArmed = (id: string) => {
    const target = peekWorkConnectorAttach();
    if (!target) return;
    attachWorkConnector(target, id);
    clearWorkConnectorAttach();
    setWorkAttachFor(null);
  };

  const install = (id: string) => {
    if (blockedIds.includes(id)) return;
    installConnector(id);
    bindToWorkIfArmed(id);
    openConnector(id);
  };

  const selectConnector = (id: string) => {
    if (workAttachFor) {
      installConnector(id);
      bindToWorkIfArmed(id);
    }
    openConnector(id);
  };

  const uninstall = (id: string) => {
    uninstallConnector(id);
  };

  const installed = apps.filter(
    (item) => item.installed && !blockedIds.includes(item.id),
  );

  const needle = query.trim().toLowerCase();
  const directory = useMemo(() => {
    const pool = view === "installed" ? installed : apps;
    return pool.filter((item) => {
      if (blockedIds.includes(item.id)) return false;
      if (!needle) return true;
      return (
        item.name.toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle) ||
        item.category.toLowerCase().includes(needle)
      );
    });
  }, [apps, blockedIds, installed, needle, view]);

  const sections = useMemo(() => {
    if (view === "installed") {
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
  }, [directory, view]);

  return (
    <DashFrame
      space="connectors"
      banner={false}
      title="Connectors"
      subtitle="Link apps so Courier can act across them."
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

        <div className="flex items-center gap-3">
          <ScopeToggle
            value={view}
            onChange={(value) => setView(value as ConnectorsView)}
            options={[
              { id: "connectors", label: "Connectors" },
              { id: "installed", label: "Installed" },
            ]}
          />
          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-1">
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
                className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-border text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
              >
                <Search className="h-4 w-4" strokeWidth={1.6} />
              </button>
            )}
          </div>
        </div>

        {sections.length ? (
          sections.map((section) => {
            const open = expanded[section.title] || Boolean(needle) || view === "installed";
            const visible = open
              ? section.items
              : section.items.slice(0, PREVIEW_ROWS);
            const rest = section.items.slice(PREVIEW_ROWS);
            return (
              <section key={section.title} className="mt-10">
                {view === "connectors" ? (
                  <h2 className="text-[15px] font-medium tracking-[-0.02em]">
                    {section.title}
                  </h2>
                ) : null}
                <div
                  className={cn(
                    "grid grid-cols-1 gap-x-8 gap-y-3 @min-[440px]:grid-cols-2",
                    view === "connectors" ? "mt-4" : "mt-0",
                  )}
                >
                  {visible.map((item) => (
                    <DirectoryItem
                      key={item.id}
                      item={item}
                      active={connectorId === item.id}
                      pinned={isPinned("connector", item.id)}
                      onOpen={() => selectConnector(item.id)}
                      onInstall={() => install(item.id)}
                      onUninstall={() => uninstall(item.id)}
                      onTogglePin={() => togglePin("connector", item.id)}
                      workAttach={Boolean(workAttachFor)}
                      catalog={view === "connectors"}
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
            {view === "installed"
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
  pinned,
  onOpen,
  onInstall,
  onUninstall,
  onTogglePin,
  workAttach,
  catalog = false,
}: {
  item: Connector;
  active: boolean;
  pinned: boolean;
  onOpen: () => void;
  onInstall: () => void;
  onUninstall: () => void;
  onTogglePin: () => void;
  workAttach?: boolean;
  catalog?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-[10px] px-1.5 py-2 transition-colors duration-200 hover:bg-muted/60",
        active && "bg-muted",
      )}
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
            ) : catalog ? (
              <span className="inline-flex h-7 shrink-0 items-center px-1 text-[11.5px] font-medium tracking-[-0.01em] text-muted-foreground">
                Connected
              </span>
            ) : (
            <Dropdown
              align="end"
              menuClassName="min-w-[8.5rem]"
              matchTrigger={false}
              trigger={({ toggle }) => (
                <button
                  type="button"
                  aria-label={`More for ${item.name}`}
                  onClick={toggle}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
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
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      close();
                      onTogglePin();
                    }}
                    className="flex w-full rounded-[10px] px-3 py-2 text-left text-[13px] hover:bg-muted"
                  >
                    {pinned ? "Unpin from menu" : "Pin to menu"}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      close();
                      onUninstall();
                    }}
                    className="flex w-full rounded-[10px] px-3 py-2 text-left text-[13px] hover:bg-muted"
                  >
                    Uninstall
                  </button>
                </>
              )}
            </Dropdown>
            )
          ) : (
            <button
              type="button"
              onClick={onInstall}
              className="inline-flex h-7 shrink-0 items-center rounded-full border border-foreground/15 px-2.5 text-[11.5px] font-medium tracking-[-0.01em] hover:bg-muted"
            >
              {workAttach ? "Add to Work" : "Install"}
            </button>
          )}
        </div>
        <p className="mt-0.5 truncate text-[12px] leading-snug text-muted-foreground">
          {item.description}
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
