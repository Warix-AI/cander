"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  SettingsGroup,
  SettingsRow,
  SettingsSwitch,
} from "@/components/settings/SettingsChrome";
import { connectors, spaces as spaceCatalog } from "@/lib/data";
import type { Member, Workspace } from "@/lib/types";
import {
  memberSpaces,
  policyFor,
  toggleDisabledConnector,
  toggleMemberSpace,
  toggleMemberWorkspace,
} from "@/lib/workspace-policy";
import type { WorkspacePolicy } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { sendWorkspaceInvite, revokeWorkspaceInvite } from "@/lib/api/workspace-invite-client";

type Props = {
  member: Member;
  orgWorkspaces: Workspace[];
  workspacePolicies: Record<string, WorkspacePolicy>;
  canEdit: boolean;
  orgId?: string;
  embedded?: boolean;
};

async function toggleWorkspaceAssignment(
  member: Member,
  workspaceId: string,
  orgId: string | undefined,
  assigned: boolean,
) {
  if (assigned) {
    if (member.email.includes("@") && !member.id.startsWith("invite-")) {
      await revokeWorkspaceInvite({
        workspaceId,
        email: member.email,
        orgId: orgId ?? null,
      }).catch(() => {
        /* no pending invite — still unassign locally */
      });
    }
    toggleMemberWorkspace(member.id, workspaceId);
    return;
  }

  if (member.email.includes("@") && !member.id.startsWith("invite-")) {
    await sendWorkspaceInvite({
      workspaceId,
      email: member.email,
      orgId: orgId ?? null,
    });
    toggleMemberWorkspace(member.id, workspaceId);
    return;
  }

  toggleMemberWorkspace(member.id, workspaceId);
}

function WorkspaceAccessBody({
  member,
  orgWorkspaces,
  workspacePolicies,
  canEdit,
  orgId,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const assigned = orgWorkspaces.filter((workspace) =>
    member.workspaceIds.includes(workspace.id),
  );

  const onToggleWorkspace = (workspaceId: string) => {
    if (!canEdit) return;
    const assignedNow = member.workspaceIds.includes(workspaceId);
    setBusy(workspaceId);
    setError(null);
    void toggleWorkspaceAssignment(member, workspaceId, orgId, assignedNow)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not update workspace.");
      })
      .finally(() => setBusy(null));
  };

  return (
    <div className="space-y-4 px-4 py-4">
      {error ? <p className="text-[12.5px] text-destructive">{error}</p> : null}
      <div>
        <p className="text-[12px] font-medium tracking-[-0.01em] text-muted-foreground">
          Workspaces
        </p>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          Assigning sends a pending invite the member must approve.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {orgWorkspaces.map((workspace) => {
            const on = member.workspaceIds.includes(workspace.id);
            return (
              <button
                key={workspace.id}
                type="button"
                disabled={!canEdit || busy === workspace.id}
                onClick={() => onToggleWorkspace(workspace.id)}
                className={cn(
                  "inline-flex h-7 items-center rounded-full px-2.5 text-[12px] font-medium tracking-[-0.01em] transition-colors duration-200 disabled:opacity-60",
                  on
                    ? "bg-primary text-primary-foreground"
                    : "border border-foreground/15 text-muted-foreground hover:text-foreground",
                )}
              >
                {workspace.name}
              </button>
            );
          })}
        </div>
      </div>

      {assigned.map((workspace) => {
        const policy = policyFor(workspace.id, workspacePolicies);
        const row = policy.members.find((item) => item.memberId === member.id);
        if (!row) return null;
        const enabled = memberSpaces(workspace.id, member.id, workspacePolicies);

        return (
          <div
            key={workspace.id}
            className={cn(
              "space-y-3 border border-border/80 bg-background/70 p-3",
              SHELL_G3_RADIUS,
            )}
          >
            <p className="text-[13px] font-medium tracking-[-0.02em]">
              {workspace.name}
            </p>
            <p className="text-[12px] text-muted-foreground">
              {enabled.length} of {workspace.spaces.length} spaces enabled
            </p>

            <div>
              <p className="text-[12px] font-medium text-muted-foreground">Spaces</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {workspace.spaces
                  .filter((spaceId) => spaceId !== "work")
                  .map((spaceId) => {
                  const on = row.spaces.includes(spaceId);
                  const space = spaceCatalog.find((item) => item.id === spaceId);
                  return (
                    <button
                      key={spaceId}
                      type="button"
                      disabled={!canEdit}
                      onClick={() =>
                        canEdit &&
                        toggleMemberSpace(workspace.id, member.id, spaceId)
                      }
                      className={cn(
                        "inline-flex h-7 items-center rounded-full px-2.5 text-[12px] font-medium tracking-[-0.01em] transition-colors duration-200 disabled:opacity-60",
                        on
                          ? "bg-primary text-primary-foreground"
                          : "border border-foreground/15 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {space?.label ?? spaceId}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-[12px] font-medium text-muted-foreground">
                Connectors
              </p>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                Workspace connector policy — affects everyone in this workspace.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {connectors
                  .filter(
                    (item) =>
                      item.installed ||
                      policy.disabledConnectors.includes(item.id),
                  )
                  .map((item) => {
                    const off = policy.disabledConnectors.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={!canEdit}
                        onClick={() =>
                          canEdit &&
                          toggleDisabledConnector(workspace.id, item.id)
                        }
                        className={cn(
                          "inline-flex h-7 items-center rounded-full px-2.5 text-[12px] font-medium tracking-[-0.01em] transition-colors duration-200 disabled:opacity-60",
                          off
                            ? "border border-foreground/15 text-muted-foreground hover:text-foreground"
                            : "bg-primary text-primary-foreground",
                        )}
                      >
                        {item.name}
                        {off ? " · off" : ""}
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>
        );
      })}

      {!assigned.length ? (
        <p className="text-[12.5px] text-muted-foreground">
          Assign a workspace above to configure spaces and connectors.
        </p>
      ) : null}
    </div>
  );
}

export function OrgMemberAccessPanel(props: Props) {
  const [open, setOpen] = useState(props.embedded ?? false);

  if (props.embedded) {
    return <WorkspaceAccessBody {...props} />;
  }

  return (
    <div className="border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-200 hover:bg-muted/40"
      >
        <span className="text-[12.5px] font-medium tracking-[-0.01em] text-muted-foreground">
          Manage access
        </span>
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform duration-200",
            open && "rotate-90",
          )}
          strokeWidth={1.8}
        />
      </button>
      {open ? (
        <div className="border-t border-border bg-muted/15">
          <WorkspaceAccessBody {...props} />
        </div>
      ) : null}
    </div>
  );
}

export function OrgMemberAccessMobile(props: Props) {
  const [openWorkspaceId, setOpenWorkspaceId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { member, orgWorkspaces, workspacePolicies, canEdit, orgId } = props;
  const assigned = orgWorkspaces.filter((workspace) =>
    member.workspaceIds.includes(workspace.id),
  );

  const onToggleWorkspace = (workspaceId: string) => {
    if (!canEdit) return;
    const assignedNow = member.workspaceIds.includes(workspaceId);
    setBusy(workspaceId);
    void toggleWorkspaceAssignment(member, workspaceId, orgId, assignedNow).finally(
      () => setBusy(null),
    );
  };

  return (
    <SettingsGroup>
      <div className="px-4 py-3">
        <p className="text-[12px] font-medium tracking-[-0.01em] text-muted-foreground">
          Workspaces
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {orgWorkspaces.map((workspace) => {
            const on = member.workspaceIds.includes(workspace.id);
            return (
              <button
                key={workspace.id}
                type="button"
                disabled={!canEdit || busy === workspace.id}
                onClick={() => onToggleWorkspace(workspace.id)}
                className={cn(
                  "inline-flex h-7 items-center rounded-full px-2.5 text-[12px] font-medium tracking-[-0.01em] transition-colors duration-200 disabled:opacity-60",
                  on
                    ? "bg-primary text-primary-foreground"
                    : "border border-foreground/15 text-muted-foreground hover:text-foreground",
                )}
              >
                {workspace.name}
              </button>
            );
          })}
        </div>
      </div>

      {assigned.map((workspace) => {
        const policy = policyFor(workspace.id, workspacePolicies);
        const row = policy.members.find((item) => item.memberId === member.id);
        if (!row) return null;
        const expanded = openWorkspaceId === workspace.id;

        return (
          <div key={workspace.id} className="border-t border-border px-4 py-3">
            <button
              type="button"
              onClick={() =>
                setOpenWorkspaceId((current) =>
                  current === workspace.id ? null : workspace.id,
                )
              }
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="text-[13px] font-medium">{workspace.name}</span>
              <ChevronRight
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  expanded && "rotate-90",
                )}
                strokeWidth={1.8}
              />
            </button>
            {expanded ? (
              <SettingsGroup className="mt-2 border-0">
                {workspace.spaces
                  .filter((spaceId) => spaceId !== "work")
                  .map((spaceId) => {
                  const on = row.spaces.includes(spaceId);
                  const space = spaceCatalog.find((item) => item.id === spaceId);
                  return (
                    <SettingsRow key={spaceId} label={space?.label ?? spaceId}>
                      <SettingsSwitch
                        label={space?.label ?? spaceId}
                        checked={on}
                        disabled={!canEdit}
                        onChange={() =>
                          canEdit &&
                          toggleMemberSpace(workspace.id, member.id, spaceId)
                        }
                      />
                    </SettingsRow>
                  );
                })}
              </SettingsGroup>
            ) : null}
          </div>
        );
      })}
    </SettingsGroup>
  );
}
