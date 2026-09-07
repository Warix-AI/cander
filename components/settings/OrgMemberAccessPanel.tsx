"use client";

import { useState } from "react";
import {
  SettingsGroup,
  SettingsRow,
  SettingsSwitch,
} from "@/components/settings/SettingsChrome";
import type { Member, Workspace, WorkspacePolicy } from "@/lib/types";
import { toggleMemberWorkspace } from "@/lib/workspace-policy";
import {
  revokeWorkspaceInvite,
  sendWorkspaceInvite,
} from "@/lib/api/workspace-invite-client";

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
  }
  toggleMemberWorkspace(member.id, workspaceId);
}

function WorkspaceAccessBody({
  member,
  orgWorkspaces,
  canEdit,
  orgId,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onToggleWorkspace = (workspaceId: string) => {
    if (!canEdit) return;
    const assigned = member.workspaceIds.includes(workspaceId);
    setBusy(workspaceId);
    setError(null);
    void toggleWorkspaceAssignment(member, workspaceId, orgId, assigned)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not update workspace.");
      })
      .finally(() => setBusy(null));
  };

  return (
    <>
      {error ? <p className="mb-2 text-[12.5px] text-destructive">{error}</p> : null}
      {orgWorkspaces.length ? (
        <SettingsGroup>
          {orgWorkspaces.map((workspace) => {
            const enabled = member.workspaceIds.includes(workspace.id);
            return (
              <SettingsRow
                key={workspace.id}
                label={workspace.name}
              >
                <SettingsSwitch
                  label={`${workspace.name} access`}
                  checked={enabled}
                  disabled={!canEdit || busy === workspace.id}
                  onChange={() => onToggleWorkspace(workspace.id)}
                />
              </SettingsRow>
            );
          })}
        </SettingsGroup>
      ) : (
        <p className="text-[12.5px] text-muted-foreground">
          No workspaces are available.
        </p>
      )}
    </>
  );
}

export function OrgMemberAccessPanel(props: Props) {
  const [open, setOpen] = useState(props.embedded ?? false);

  if (props.embedded) {
    return <WorkspaceAccessBody {...props} />;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="settings-glass-row flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="text-[12.5px] font-medium tracking-[-0.01em] text-muted-foreground">
          Manage access
        </span>
        <span className="text-[12px] text-muted-foreground">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open ? <WorkspaceAccessBody {...props} /> : null}
    </div>
  );
}

export function OrgMemberAccessMobile(props: Props) {
  return <WorkspaceAccessBody {...props} />;
}
