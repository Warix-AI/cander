"use client";

import { useApp } from "@/components/app/AppProvider";
import { Row, SectionLabel } from "@/components/panels/Bits";
import { connectors } from "@/lib/data";
import { cn } from "@/lib/utils";
import { policyFor } from "@/lib/workspace-policy";

export function ConnectorsPanel() {
  const { connectorId, openConnector, workspaceId, workspacePolicies } = useApp();
  const blockedIds = policyFor(workspaceId, workspacePolicies).disabledConnectors;
  const allowed = connectors.filter((item) => !blockedIds.includes(item.id));
  const blocked = connectors.filter((item) => blockedIds.includes(item.id));
  const selected =
    allowed.find((item) => item.id === connectorId) ??
    allowed[0] ??
    connectors[0];

  return (
    <div className="flex h-full">
      <div className="w-[42%] min-w-[10rem] border-r border-border py-3">
        <SectionLabel>Apps</SectionLabel>
        {allowed.map((item) => (
          <Row
            key={item.id}
            title={item.name}
            meta={`${item.accounts.length}`}
            active={selected.id === item.id}
            onClick={() => openConnector(item.id)}
          />
        ))}
        {blocked.length ? (
          <>
            <SectionLabel>Disabled here</SectionLabel>
            {blocked.map((item) => (
              <Row
                key={item.id}
                title={item.name}
                meta="Blocked"
              />
            ))}
          </>
        ) : null}
      </div>
      <div className="min-w-0 flex-1 py-3">
        <SectionLabel>{selected.name}</SectionLabel>
        {selected.accounts.map((account) => (
          <div key={account.id} className="px-3 py-2">
            <p className="text-[13px]">{account.label}</p>
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
        <div className="mt-3">
          <SectionLabel>Actions</SectionLabel>
          {selected.actions.map((action) => (
            <Row key={action} title={action} />
          ))}
        </div>
        <div className="mt-3 px-3">
          <button
            type="button"
            className="inline-flex h-10 items-center rounded-full border border-foreground/20 px-4 text-[13px] font-medium tracking-[-0.01em] hover:bg-muted"
          >
            Add connection
          </button>
        </div>
      </div>
    </div>
  );
}
