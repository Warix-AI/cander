"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Check, MoreHorizontal, Search, Settings } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { useApp } from "@/components/app/AppProvider";
import { SpaceSettingsButton, DashFrame } from "@/components/spaces/ItemSet";
import { Dropdown } from "@/components/ui/Controls";
import {
  getInstalledConnectorsServerSnapshot,
  getInstalledConnectorsSnapshot,
  installConnector,
  subscribeInstalledConnectors,
  uninstallConnector,
} from "@/lib/connector-install";
import { connectors as seed, spaceStats } from "@/lib/data";
import type { Connector, ConnectorScope } from "@/lib/types";
import { cn } from "@/lib/utils";
import { blockedConnectorIds } from "@/lib/workspace-policy";

const SECTION_ORDER = [
  "Featured",
  "Productivity",
  "Engineering",
  "Data",
  "Communication",
  "Commerce",
  "Internal",
] as const;

const PREVIEW_ROWS = 8;

export function ConnectorsDashboard() {
  const {
    connectorId,
    openConnector,
    workspaceId,
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
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<ConnectorScope>("public");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const blockedIds = blockedConnectorIds(
    workspaceId,
    workspacePolicies,
    billingPlan,
  );

  const apps = useMemo(
    () =>
      seed.map((item) => {
        const installed = item.installed || installedIds.includes(item.id);
        return {
          ...item,
          installed,
          accounts:
            installed && !item.accounts.length
              ? [
                  {
                    id: item.id === "handshake" ? "hs-1" : `${item.id}-1`,
                    label: "Acme Inc.",
                    status: "connected" as const,
                  },
                ]
              : item.accounts,
        };
      }),
    [installedIds],
  );

  const install = (id: string) => {
    if (blockedIds.includes(id)) return;
    installConnector(id);
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
    return apps.filter((item) => {
      if (blockedIds.includes(item.id)) return false;
      if (item.scope !== scope) return false;
      if (!needle) return true;
      return (
        item.name.toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle) ||
        item.category.toLowerCase().includes(needle)
      );
    });
  }, [apps, blockedIds, needle, scope]);

  const sections = useMemo(() => {
    const featured = directory.filter((item) => item.featured);
    const featuredIds = new Set(featured.map((item) => item.id));
    const groups: { title: string; items: Connector[] }[] = [];
    if (featured.length && scope === "public") {
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
  }, [directory, scope]);

  return (
    <DashFrame
      space="connectors"
      banner={false}
      kicker={spaceStats.connectors.kicker}
      title="Connectors"
      subtitle="Work with Courier across your favorite tools."
      actions={<SpaceSettingsButton space="connectors" />}
    >

        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.6}
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search connectors"
            className="h-11 w-full rounded-full border border-border bg-card pr-4 pl-11 text-[14px] outline-none placeholder:text-muted-foreground focus:border-foreground/20"
          />
        </div>

        {installed.length ? (
          <section className="mt-8">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] font-medium tracking-[-0.01em]">
                Installed
              </p>
              <button
                type="button"
                aria-label="Manage installed connectors"
                onClick={() => openConnector(installed[0].id)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
              >
                <Settings className="h-3.5 w-3.5" strokeWidth={1.6} />
              </button>
            </div>
            <div className="mt-3 flex gap-3 overflow-x-auto pt-1.5 pr-1 pb-1 pl-1.5">
              {installed.map((item) => {
                const active = item.accounts.some(
                  (account) => account.status === "connected",
                );
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={item.name}
                    onClick={() => openConnector(item.id)}
                    className={cn(
                      "relative shrink-0 rounded-[10px] transition-opacity duration-200 hover:opacity-80",
                      connectorId === item.id && "ring-2 ring-foreground/15",
                    )}
                  >
                    <ConnectorMark id={item.icon} size="md" />
                    {active ? (
                      <span className="absolute -top-1 -left-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-chart-2 text-white">
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <div className="mt-8 inline-flex rounded-full border border-border p-0.5">
          {(["public", "personal"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setScope(id)}
              className={cn(
                "inline-flex h-8 items-center rounded-full px-4 text-[13px] font-medium tracking-[-0.01em] capitalize transition-colors duration-200",
                scope === id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {id}
            </button>
          ))}
        </div>

        {sections.length ? (
          sections.map((section) => {
            const open = expanded[section.title] || Boolean(needle);
            const visible = open
              ? section.items
              : section.items.slice(0, PREVIEW_ROWS);
            const rest = section.items.slice(PREVIEW_ROWS);
            return (
              <section key={section.title} className="mt-10">
                <h2 className="text-[15px] font-medium tracking-[-0.02em]">
                  {section.title}
                </h2>
                <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                  {visible.map((item) => (
                    <DirectoryItem
                      key={item.id}
                      item={item}
                      active={connectorId === item.id}
                      pinned={isPinned("connector", item.id)}
                      onOpen={() => openConnector(item.id)}
                      onInstall={() => install(item.id)}
                      onUninstall={() => uninstall(item.id)}
                      onTogglePin={() => togglePin("connector", item.id)}
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
            No connectors match that search.
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
}: {
  item: Connector;
  active: boolean;
  pinned: boolean;
  onOpen: () => void;
  onInstall: () => void;
  onUninstall: () => void;
  onTogglePin: () => void;
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
          ) : (
            <button
              type="button"
              onClick={onInstall}
              className="inline-flex h-7 shrink-0 items-center rounded-full border border-foreground/15 px-2.5 text-[11.5px] font-medium tracking-[-0.01em] hover:bg-muted"
            >
              Install
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
