"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import { useApp } from "@/components/app/AppProvider";
import {
  SettingsGroup,
  SettingsHeader,
  SettingsPage,
  SettingsRow,
  SettingsSection,
  settingsInputClass,
} from "@/components/settings/SettingsChrome";
import {
  addWorkspaceConnection,
  connectionsForConnector,
  connectorsAvailableForKind,
  getWorkspaceConnectionsServerSnapshot,
  getWorkspaceConnectionsSnapshot,
  removeWorkspaceConnection,
  subscribeWorkspaceConnections,
} from "@/lib/workspace-connections";
import { workspaceKindLabel, workspaceKindOf } from "@/lib/workspace-kind";
import { cn } from "@/lib/utils";

export function ConnectorsSettings() {
  const { workspaceId, workspace } = useApp();
  useSyncExternalStore(
    subscribeWorkspaceConnections,
    getWorkspaceConnectionsSnapshot,
    getWorkspaceConnectionsServerSnapshot,
  );
  const kind = workspaceKindOf(workspace);
  const catalog = useMemo(() => connectorsAvailableForKind(kind), [kind]);
  const [draftLabel, setDraftLabel] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<string | null>(null);

  return (
    <SettingsPage>
      <SettingsHeader
        title="Connectors"
        subtitle="Connections live on this workspace only. Switch workspaces in the rail to manage a different set."
        actions={
          <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[12px]">
            <span className="font-medium tracking-[-0.01em]">
              {workspace.name}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {workspaceKindLabel(kind)}
            </span>
          </div>
        }
      />

      <SettingsSection
        title="Apps"
        description="Each connector can have multiple accounts in this workspace."
        className="mt-8"
      >
        <div className="space-y-3">
          {catalog.map((item) => {
            const accounts = connectionsForConnector(
              workspaceId,
              item.id,
              workspace,
            );
            const open = adding === item.id;
            return (
              <SettingsGroup key={item.id}>
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <ConnectorMark id={item.icon} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium tracking-[-0.01em]">
                      {item.name}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                      {accounts.length
                        ? `${accounts.length} connection${accounts.length === 1 ? "" : "s"}`
                        : "Not connected"}
                    </p>
                  </div>
                  {!open ? (
                    <button
                      type="button"
                      onClick={() => setAdding(item.id)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-foreground/15 px-3 text-[12.5px] font-medium tracking-[-0.01em] hover:bg-muted"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={1.7} />
                      Add
                    </button>
                  ) : null}
                </div>

                {accounts.map((account) => (
                  <SettingsRow
                    key={account.id}
                    label={account.label}
                    description={
                      account.status === "needs-reauth"
                        ? "Needs reauthentication"
                        : account.status === "connected"
                          ? "Connected"
                          : account.status
                    }
                  >
                    <button
                      type="button"
                      aria-label={`Remove ${account.label}`}
                      onClick={() =>
                        removeWorkspaceConnection(
                          workspaceId,
                          item.id,
                          account.id,
                          workspace,
                        )
                      }
                      className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                    </button>
                  </SettingsRow>
                ))}

                {open ? (
                  <form
                    className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const label =
                        draftLabel[item.id]?.trim() ||
                        (kind === "personal"
                          ? "Personal account"
                          : "Work account");
                      addWorkspaceConnection(
                        workspaceId,
                        item.id,
                        label,
                        workspace,
                      );
                      setDraftLabel((prev) => ({ ...prev, [item.id]: "" }));
                      setAdding(null);
                    }}
                  >
                    <input
                      value={draftLabel[item.id] ?? ""}
                      onChange={(event) =>
                        setDraftLabel((prev) => ({
                          ...prev,
                          [item.id]: event.target.value,
                        }))
                      }
                      placeholder={
                        kind === "personal"
                          ? "you@gmail.com"
                          : "team@company.com"
                      }
                      className={cn(settingsInputClass, "sm:flex-1")}
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="inline-flex h-9 items-center rounded-full bg-primary px-3.5 text-[12.5px] font-medium text-primary-foreground"
                      >
                        Connect
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdding(null)}
                        className="inline-flex h-9 items-center rounded-full px-3 text-[12.5px] text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
              </SettingsGroup>
            );
          })}
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
