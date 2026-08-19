import { accountPresets, workspaceResources, workspaces } from "./data";
import {
  hasConnectorPolicies,
  hasModelChoice,
  hasVoice,
  hasWorkSpace,
  hasWorkspaceKnowledge,
  hasWorkspaces,
  hostingAllowed,
  platformNavAllowed,
  workspaceCap,
} from "./billing";
import {
  canAccessDevelopment,
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
  PlatformNav,
  Workspace,
  WorkspaceResource,
} from "./types";

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
  canUseSharedWorkspaces: boolean;
  canUseWorkSpace: boolean;
  canAccessDevelopment: boolean;
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
  platformNavAllowed: (nav: PlatformNav) => boolean;
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
    canUseSharedWorkspaces: orgActive,
    canUseWorkSpace: orgActive && hasWorkSpace(plan),
    canAccessDevelopment: canAccessDevelopment(plan),
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
    platformNavAllowed: (nav) => platformNavAllowed(plan, nav),
    canUseSharedResource: (resourceId) => {
      const resource = workspaceResources.find((item) => item.id === resourceId);
      if (!resource) return false;
      if (resource.ownerId === actor.id) return true;
      if (!resource.authorizedMemberIds.includes(actor.id)) return false;
      return canAccessDevelopment(plan);
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
  if (access.canManageWorkspaces) {
    return workspaces.filter((item) => !item.personal);
  }
  if (access.canUseSharedWorkspaces) {
    return workspaces.filter(
      (item) => !item.personal && actor.workspaceIds.includes(item.id),
    );
  }
  return workspaces.filter((item) => actor.workspaceIds.includes(item.id));
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
