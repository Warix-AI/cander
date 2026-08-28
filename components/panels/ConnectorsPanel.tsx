"use client";

import { useMemo, useSyncExternalStore } from "react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { useApp } from "@/components/app/AppProvider";
import { PanelChrome } from "@/components/panels/PanelChrome";
import { ProjectsBrowser } from "@/components/panels/ProjectsBrowser";
import { Row, SectionLabel } from "@/components/panels/Bits";
import { connectors } from "@/lib/data";
import {
  useSpaceAttachments,
  useSpaceProjects,
} from "@/lib/hooks/use-space-query";
import { cn } from "@/lib/utils";
import { SHELL_PANEL_BODY } from "@/lib/shell-chrome";
import { blockedConnectorIds } from "@/lib/workspace-policy";
import {
  connectionsForConnector,
  getWorkspaceConnectionsServerSnapshot,
  getWorkspaceConnectionsSnapshot,
  subscribeWorkspaceConnections,
} from "@/lib/workspace-connections";

export function ConnectorsPanel() {
  const {
    connectorId,
    openConnector,
    openProject,
    workspaceId,
    workspace,
    workspacePolicies,
    panelIntent,
    billingPlan,
  } = useApp();
  useSyncExternalStore(
    subscribeWorkspaceConnections,
    getWorkspaceConnectionsSnapshot,
    getWorkspaceConnectionsServerSnapshot,
  );
  const { data: attachments } = useSpaceAttachments();
  const { data: buildProjects } = useSpaceProjects("build");
  const { data: automations } = useSpaceProjects("build", {
    kind: "automation",
  });
  const blockedIds = blockedConnectorIds(
    workspaceId,
    workspacePolicies,
    billingPlan,
  );
  const allowed = connectors.filter((item) => !blockedIds.includes(item.id));
  const blocked = connectors.filter((item) => blockedIds.includes(item.id));
  const selected =
    allowed.find((item) => item.id === connectorId) ??
    allowed[0] ??
    connectors[0];
  const execute = panelIntent === "execute" || Boolean(connectorId);
  const accounts = connectionsForConnector(
    workspaceId,
    selected.id,
    workspace,
  );

  const relatedApps = useMemo(() => {
    const fromAttach = attachments
      .map((item) =>
        buildProjects.find((project) => project.id === item.targetId),
      )
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const published = buildProjects.filter(
      (item) =>
        item.kind !== "automation" &&
        item.status === "published" &&
        !fromAttach.some((attached) => attached.id === item.id),
    );
    return [...fromAttach, ...published].slice(0, 6);
  }, [attachments, buildProjects]);

  const relatedAutomations = useMemo(
    () => automations.filter((item) => item.status === "published").slice(0, 6),
    [automations],
  );

  if (!execute) {
    return <ProjectsBrowser />;
  }

  return (
    <div className={SHELL_PANEL_BODY}>
      <PanelChrome kicker="Connector" title={selected.name} />
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full">
          <div className="w-[42%] min-w-[10rem] border-r border-border py-3">
            <SectionLabel>Apps</SectionLabel>
            {allowed.map((item) => {
              const count = connectionsForConnector(
                workspaceId,
                item.id,
                workspace,
              ).length;
              return (
                <Row
                  key={item.id}
                  title={item.name}
                  meta={`${count}`}
                  active={selected.id === item.id}
                  onClick={() => openConnector(item.id)}
                  leading={<ConnectorMark id={item.icon} size="xs" />}
                />
              );
            })}
            {blocked.length ? (
              <>
                <SectionLabel>Disabled here</SectionLabel>
                {blocked.map((item) => (
                  <Row
                    key={item.id}
                    title={item.name}
                    meta="Blocked"
                    leading={<ConnectorMark id={item.icon} size="xs" />}
                  />
                ))}
              </>
            ) : null}
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto py-3">
            <SectionLabel>{selected.name}</SectionLabel>
            <p className="px-3 pb-2 text-[12.5px] leading-relaxed text-muted-foreground">
              {selected.description}
            </p>
            {accounts.length ? (
              accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center gap-2.5 px-3 py-2"
                >
                  <ConnectorMark id={selected.icon} size="xs" />
                  <div className="min-w-0">
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
                </div>
              ))
            ) : (
              <p className="px-3 py-2 text-[13px] text-muted-foreground">
                No account connected yet.
              </p>
            )}
            <div className="mt-3">
              <SectionLabel>Actions</SectionLabel>
              {selected.actions.map((action) => (
                <Row key={action} title={action} />
              ))}
            </div>
            <div className="mt-3">
              <SectionLabel>Apps using this</SectionLabel>
              {relatedApps.length ? (
                relatedApps.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openProject(item.id)}
                    className="block w-full text-left"
                  >
                    <Row title={item.title} meta="Build · in Work" />
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-[13px] text-muted-foreground">
                  No Work apps linked yet.
                </p>
              )}
            </div>
            <div className="mt-3">
              <SectionLabel>Automations using this</SectionLabel>
              {relatedAutomations.length ? (
                relatedAutomations.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openProject(item.id)}
                    className="block w-full text-left"
                  >
                    <Row title={item.title} meta="Active" />
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-[13px] text-muted-foreground">
                  No automations linked yet.
                </p>
              )}
            </div>
            <div className="mt-3 px-3 pb-3">
              <button
                type="button"
                className="inline-flex h-10 items-center rounded-full border border-foreground/20 px-4 text-[13px] font-medium tracking-[-0.01em] hover:bg-muted"
              >
                Add connection
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
