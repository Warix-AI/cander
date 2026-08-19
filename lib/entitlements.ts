import { accountPresets, workspaces } from "./data";
import {
  hasLimitedPlatform,
  hasModelChoice,
  hasVoice,
  hasWorkSpace,
  hasWorkspaceKnowledge,
  hasWorkspaces,
  hostingAllowed,
  platformNavAllowed,
  workspaceCap,
} from "./billing";
import type {
  AccountPresetId,
  BillingPlan,
  HostingMode,
  Member,
  PlatformNav,
  Role,
  UltraLicense,
  Workspace,
} from "./types";

export type Entitlements = {
  plan: BillingPlan;
  role: Role;
  inOrg: boolean;
  orgActive: boolean;
  pendingInvite: boolean;
  ultraAssigned: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isMember: boolean;
  canManageBilling: boolean;
  canManageMembers: boolean;
  canAssignUltra: boolean;
  canBuyUltra: boolean;
  canManageWorkspaces: boolean;
  canUseSharedWorkspaces: boolean;
  canUseWorkSpace: boolean;
  hasVoice: boolean;
  hasWorkspaces: boolean;
  hasWorkspaceKnowledge: boolean;
  hasConnectorPolicies: boolean;
  hasLimitedPlatform: boolean;
  hasFullPlatform: boolean;
  hasModelChoice: boolean;
  workspaceCap: number;
  showOrgSettings: boolean;
  showWorkspacesAdmin: boolean;
  showPlansBilling: boolean;
  showInviteWall: boolean;
  hostingAllowed: (mode: HostingMode) => boolean;
  platformNavAllowed: (nav: PlatformNav) => boolean;
};

export function entitlementsFor(
  actor: Member,
  licenses: UltraLicense[],
): Entitlements {
  const plan = actor.plan;
  const orgActive =
    actor.kind === "org" &&
    actor.plan === "pro" &&
    actor.seatStatus === "active";
  const pendingInvite =
    actor.kind === "org" && actor.seatStatus === "pending";
  const ultraAssigned = licenses.some((item) => item.userId === actor.id);
  const isOwner = orgActive && actor.role === "Owner";
  const isAdmin = orgActive && actor.role === "Admin";
  const isMember = orgActive && actor.role === "Member";
  const limited = hasLimitedPlatform(plan);
  const full = ultraAssigned && plan !== "free";

  return {
    plan,
    role: actor.role,
    inOrg: actor.kind === "org",
    orgActive,
    pendingInvite,
    ultraAssigned,
    isOwner,
    isAdmin,
    isMember,
    canManageBilling: isOwner,
    canManageMembers: isOwner || isAdmin,
    canAssignUltra: isOwner || isAdmin,
    canBuyUltra: isOwner,
    canManageWorkspaces: isOwner || isAdmin,
    canUseSharedWorkspaces: orgActive,
    canUseWorkSpace: orgActive && hasWorkSpace(plan),
    hasVoice: hasVoice(plan),
    hasWorkspaces: hasWorkspaces(plan),
    hasWorkspaceKnowledge: hasWorkspaceKnowledge(plan),
    hasConnectorPolicies: orgActive,
    hasLimitedPlatform: limited,
    hasFullPlatform: full,
    hasModelChoice: hasModelChoice(plan) && orgActive,
    workspaceCap: workspaceCap(plan),
    showOrgSettings: isOwner || isAdmin,
    showWorkspacesAdmin: isOwner || isAdmin,
    showPlansBilling: isOwner || isAdmin,
    showInviteWall: pendingInvite,
    hostingAllowed: (mode) => hostingAllowed(plan, mode),
    platformNavAllowed: (nav) => platformNavAllowed(plan, nav, full),
  };
}

export function orgMembersOf(members: Member[]) {
  return members.filter((item) => item.kind === "org");
}

export function orgProSeats(members: Member[]) {
  return orgMembersOf(members).filter(
    (item) => item.plan === "pro" && item.seatStatus === "active",
  ).length;
}

export function orgUltraLicenses(licenses: UltraLicense[]) {
  return licenses.filter((item) => item.scope === "org");
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
    accountPresets.find((item) => item.actorId === actorId)?.id ?? "pro-owner"
  );
}
