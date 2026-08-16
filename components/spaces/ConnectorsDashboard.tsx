"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { Kpi } from "@/components/platform/Charts";
import { useApp } from "@/components/app/AppProvider";
import { DashFrame, LayoutToggle, Pill } from "@/components/spaces/ItemSet";
import { connectors as seed } from "@/lib/data";
import type { Connector } from "@/lib/types";
import { cn } from "@/lib/utils";
import { policyFor } from "@/lib/workspace-policy";

export function ConnectorsDashboard() {
  const {
    connectorId,
    openConnector,
    spaceLayout,
    setSpaceLayout,
    workspaceId,
    workspacePolicies,
  } = useApp();
  const [apps, setApps] = useState<Connector[]>(seed);
  const blockedIds = policyFor(
    workspaceId,
    workspacePolicies,
  ).disabledConnectors;
  const allowed = apps.filter((item) => !blockedIds.includes(item.id));
  const blocked = apps.filter((item) => blockedIds.includes(item.id));
  const selected =
    apps.find((item) => item.id === connectorId) ??
    allowed.find((item) => item.installed) ??
    allowed[0] ??
    apps[0];

  const installed = allowed.filter((item) => item.installed);
  const available = allowed.filter((item) => !item.installed);
  const accounts = installed.reduce((n, item) => n + item.accounts.length, 0);
  const reauth = installed.reduce(
    (n, item) => n + item.accounts.filter((a) => a.status === "needs-reauth").length,
    0,
  );

  const install = (id: string) => {
    if (blockedIds.includes(id)) return;
    setApps((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              installed: true,
              accounts: item.accounts.length
                ? item.accounts
                : [{ id: `${id}-1`, label: "Acme Inc.", status: "connected" }],
            }
          : item,
      ),
    );
    openConnector(id);
  };

  const uninstall = (id: string) => {
    setApps((current) =>
      current.map((item) =>
        item.id === id ? { ...item, installed: false, accounts: [] } : item,
      ),
    );
  };

  return (
    <DashFrame
      kicker="Installed and available"
      title="Connectors"
      actions={<LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />}
    >
      <div className="mt-6 flex flex-wrap gap-px overflow-hidden rounded-[10px] border border-border bg-border">
        <Kpi label="Installed" value={String(installed.length)} />
        <Kpi label="Available" value={String(available.length)} />
        <Kpi label="Accounts" value={String(accounts)} />
        <Kpi label="Needs reauth" value={String(reauth)} />
      </div>

      <Section title="Installed">
        <ConnectorGrid
          items={installed}
          layout={spaceLayout}
          activeId={selected?.id}
          onOpen={openConnector}
        />
      </Section>

      <Section title="Available">
        <ConnectorGrid
          items={available}
          layout={spaceLayout}
          activeId={selected?.id}
          onOpen={openConnector}
          onInstall={install}
        />
      </Section>

      {blocked.length ? (
        <Section title="Disabled in this workspace">
          <ConnectorGrid
            items={blocked}
            layout={spaceLayout}
            activeId={selected?.id}
            onOpen={openConnector}
            blocked
          />
        </Section>
      ) : null}

      {selected ? (
        <section className="mt-8 rounded-[10px] border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <ConnectorMark id={selected.icon} />
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-medium tracking-[-0.03em]">
                {selected.name}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {selected.category}
                {selected.installed ? " · Installed" : " · Not installed"}
              </p>
            </div>
            {blockedIds.includes(selected.id) ? (
              <span className="inline-flex h-8 items-center rounded-full border border-foreground/15 px-3 text-[12px] text-muted-foreground">
                Disabled here
              </span>
            ) : selected.installed ? (
              <Pill onClick={() => uninstall(selected.id)}>Disconnect</Pill>
            ) : (
              <Pill primary onClick={() => install(selected.id)}>
                Connect
              </Pill>
            )}
          </div>

          {blockedIds.includes(selected.id) ? (
            <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
              {selected.name} is disabled for this workspace. People here
              cannot connect it. Change that in Settings → Workspaces.
            </p>
          ) : selected.installed ? (
            <>
              <p className="mt-5 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
                Accounts
              </p>
              <div className="mt-2">
                {selected.accounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-baseline justify-between gap-3 py-2"
                  >
                    <p className="text-[13.5px]">{account.label}</p>
                    <p
                      className={cn(
                        "font-mono text-[11px]",
                        account.status === "connected"
                          ? "text-muted-foreground"
                          : "text-chart-3",
                      )}
                    >
                      {account.status === "needs-reauth"
                        ? "Needs reauthentication"
                        : account.status}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-4 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
                Actions
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {selected.actions.join(" · ")}
              </p>
            </>
          ) : (
            <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
              Connect {selected.name} to use it from chat. Courier will ask before
              reading or writing on this account.
            </p>
          )}
        </section>
      ) : null}
    </DashFrame>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-8">
      <p className="mb-3 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
        {title}
      </p>
      {children}
    </div>
  );
}

function ConnectorGrid({
  items,
  layout,
  activeId,
  onOpen,
  onInstall,
  blocked,
}: {
  items: Connector[];
  layout: "cards" | "list";
  activeId?: string;
  onOpen: (id: string) => void;
  onInstall?: (id: string) => void;
  blocked?: boolean;
}) {
  if (!items.length) {
    return (
      <p className="text-[13px] text-muted-foreground">Nothing in this list.</p>
    );
  }

  if (layout === "list") {
    return (
      <div>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpen(item.id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left transition-colors duration-200 hover:bg-muted",
              activeId === item.id && "bg-muted",
              blocked && "opacity-55",
            )}
          >
            <ConnectorMark id={item.icon} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] tracking-[-0.015em]">
                {item.name}
              </span>
              <span className="block font-mono text-[11px] text-muted-foreground">
                {item.category}
                {blocked
                  ? " · Disabled"
                  : item.installed
                    ? ` · ${item.accounts.length} accounts`
                    : ""}
              </span>
            </span>
            {!blocked && !item.installed && onInstall ? (
              <span
                role="presentation"
                onClick={(event) => {
                  event.stopPropagation();
                  onInstall(item.id);
                }}
                className="inline-flex h-8 items-center rounded-full border border-foreground/15 px-3 text-[12px]"
              >
                Connect
              </span>
            ) : null}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onOpen(item.id)}
          className={cn(
            "rounded-[10px] border border-border bg-card p-4 text-left transition-colors duration-200 hover:bg-muted",
            activeId === item.id && "border-foreground/20 bg-muted",
            blocked && "opacity-55",
          )}
        >
          <ConnectorMark id={item.icon} />
          <p className="mt-3 text-[14px] font-medium tracking-[-0.02em]">
            {item.name}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {item.category}
          </p>
          {blocked ? (
            <p className="mt-3 font-mono text-[11px] text-muted-foreground">
              Disabled in this workspace
            </p>
          ) : !item.installed && onInstall ? (
            <span className="mt-3 inline-flex h-8 items-center rounded-full border border-foreground/15 px-3 text-[12px]">
              Connect
            </span>
          ) : (
            <p className="mt-3 font-mono text-[11px] text-muted-foreground">
              {item.accounts.length} accounts
            </p>
          )}
        </button>
      ))}
    </div>
  );
}
