import { accountPresets, workspaceResources } from "./data";
import {
  hasConnectorPolicies,
  hasModelChoice,
  hasVoice,
  hasWorkSpace,
  hasWorkspaceKnowledge,
  hasWorkspaces,
  hostingAllowed,
  workspaceCap,
} from "./billing";
import {
  canManageInfrastructure,
  capabilitiesFor,
  devDepthLabel,
  type DevDepth,
} from "./plan-entitlements";
import type {
  AccountPresetId,
  BillingPlan,
  HostingMode,
  Member,
  Workspace,
  WorkspaceResource,
} from "./types";
import { getWorkspaceCatalogSnapshot } from "./workspace-catalog";
import {
  emailFitsWorkspaceKind,
  workspaceKindOf,
} from "./workspace-kind";

export type Entitlements = {
  plan: BillingPlan;
  role: Member["role"];
  inOrg: boolean;
  orgActive: boolean;
  pendingInvite: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isMember: boolean;
  canManageBilling: boolean;
  canManageMembers: boolean;
  canManageWorkspaces: boolean;
  canCreatePersonalWorkspace: boolean;
  canCreateBusinessWorkspace: boolean;
  canUseSharedWorkspaces: boolean;
  canUseWorkSpace: boolean;
  canManageInfrastructure: boolean;
  devDepth: DevDepth;
  devDepthLabel: string;
  hasVoice: boolean;
  hasWorkspaces: boolean;
  hasWorkspaceKnowledge: boolean;
  hasConnectorPolicies: boolean;
  hasModelChoice: boolean;
  workspaceCap: number;
  showOrgSettings: boolean;
  showWorkspacesAdmin: boolean;
  showPlansBilling: boolean;
  showInviteWall: boolean;
  hostingAllowed: (mode: HostingMode) => boolean;
  canUseSharedResource: (resourceId: string) => boolean;
};

function isOrgTeamPlan(plan: BillingPlan) {
  return plan === "max" || plan === "ultra";
}

export function entitlementsFor(actor: Member): Entitlements {
  const plan = actor.plan;
  const orgActive =
    actor.kind === "org" &&
    isOrgTeamPlan(actor.plan) &&
    actor.seatStatus === "active";
  const pendingInvite =
    actor.kind === "org" && actor.seatStatus === "pending";
  const isOwner = orgActive && actor.role === "Owner";
  const isAdmin = orgActive && actor.role === "Admin";
  const isMember = orgActive && actor.role === "Member";
  const caps = capabilitiesFor(plan);

  return {
    plan,
    role: actor.role,
    inOrg: actor.kind === "org",
    orgActive,
    pendingInvite,
    isOwner,
    isAdmin,
    isMember,
    canManageBilling: isOwner,
    canManageMembers: isOwner || isAdmin,
    canManageWorkspaces: isOwner || isAdmin,
    /** Friends/family workspaces — available on every plan. */
    canCreatePersonalWorkspace: !pendingInvite,
    /** Company workspaces — owners/admins on Max/Ultra. */
    canCreateBusinessWorkspace: isOwner || isAdmin,
    canUseSharedWorkspaces: orgActive,
    canUseWorkSpace: orgActive && hasWorkSpace(plan),
    canManageInfrastructure: canManageInfrastructure(plan),
    devDepth: caps.devDepth,
    devDepthLabel: devDepthLabel(caps.devDepth),
    hasVoice: hasVoice(plan),
    hasWorkspaces: hasWorkspaces(plan),
    hasWorkspaceKnowledge: hasWorkspaceKnowledge(plan),
    hasConnectorPolicies: orgActive && hasConnectorPolicies(plan),
    hasModelChoice: hasModelChoice(plan),
    workspaceCap: workspaceCap(plan),
    showOrgSettings: isOwner || isAdmin,
    showWorkspacesAdmin: isOwner || isAdmin,
    showPlansBilling: isOwner || isAdmin,
    showInviteWall: pendingInvite,
    hostingAllowed: (mode) => hostingAllowed(plan, mode),
    canUseSharedResource: (resourceId) => {
      const resource = workspaceResources.find((item) => item.id === resourceId);
      if (!resource) return false;
      if (resource.ownerId === actor.id) return true;
      if (!resource.authorizedMemberIds.includes(actor.id)) return false;
      return caps.sharedResources;
    },
  };
}

export function orgMembersOf(members: Member[]) {
  return members.filter((item) => item.kind === "org");
}

export function orgMaxSeats(members: Member[]) {
  return orgMembersOf(members).filter(
    (item) => item.plan === "max" && item.seatStatus === "active",
  ).length;
}

export function orgUltraSeats(members: Member[]) {
  return orgMembersOf(members).filter(
    (item) => item.plan === "ultra" && item.seatStatus === "active",
  ).length;
}

export function sharedResourcesFor(
  workspaceId: string,
  actor: Member,
  access: Entitlements,
): WorkspaceResource[] {
  return workspaceResources.filter((item) => {
    if (item.workspaceId !== workspaceId || item.status !== "active") return false;
    if (access.canManageInfrastructure && item.ownerId === actor.id) return true;
    return access.canUseSharedResource(item.id);
  });
}

export function workspacesFor(actor: Member, access: Entitlements): Workspace[] {
  const workspaces = getWorkspaceCatalogSnapshot();
  return workspaces.filter((item) => {
    const kind = workspaceKindOf(item);

    if (item.id.startsWith("solo-")) {
      if (item.id === "solo-pro" && actor.plan !== "pro") return false;
      if (item.id === "solo-ultra" && actor.plan !== "ultra") return false;
      if (item.id === "solo-free" && actor.plan !== "free") return false;
      return actor.workspaceIds.includes(item.id) || !access.orgActive;
    }

    if (kind === "business") {
      if (access.canManageWorkspaces) return true;
      return actor.workspaceIds.includes(item.id);
    }

    // Personal (non-solo): members only
    return actor.workspaceIds.includes(item.id);
  });
}

export function canInviteEmailToWorkspace(
  workspace: Workspace,
  email: string,
): string | null {
  const kind = workspaceKindOf(workspace);
  if (emailFitsWorkspaceKind(kind, email)) return null;
  if (kind === "business") {
    return "Business workspaces only accept company email addresses.";
  }
  return "Personal workspaces only accept personal email addresses.";
}

export function homeWorkspaceId(actor: Member, access: Entitlements) {
  const allowed = workspacesFor(actor, access);
  return allowed[0]?.id ?? actor.workspaceIds[0] ?? "marketing";
}

export function presetForActor(actorId: string): AccountPresetId {
  return (
    accountPresets.find((item) => item.actorId === actorId)?.id ?? "max-owner"
  );
}

export function memberName(memberId: string, members: Member[]) {
  return members.find((item) => item.id === memberId)?.name ?? memberId;
}
