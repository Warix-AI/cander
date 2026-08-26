import type { BillingPlan } from "./types";

export type DevDepth = "none" | "build" | "collaborate" | "operate";

export type PlanCapabilities = {
  devDepth: DevDepth;
  developmentAccess: boolean;
  apiAccess: "none" | "limited" | "dev" | "production";
  apiKeys: "none" | "test" | "dev" | "production";
  models: "none" | "explore" | "dev" | "shared" | "production";
  deployments: "none" | "test" | "team" | "production";
  /** Entitlement to *select* local compute — not a device-class lock. */
  localHosting: boolean;
  /** Entitlement to *select* on-device compute — not "phones can't run models." */
  onDeviceHosting: boolean;
  /** Permission to serve production workloads. Location is still HostingMode. */
  productionServing: boolean;
  infrastructureManagement: boolean;
  sharedResources: boolean;
  logs: "none" | "limited" | "full";
  usage: "none" | "limited" | "full";
  docs: boolean;
  workSpace: boolean;
  sharedWorkspaces: boolean;
  voice: boolean;
  workspaces: boolean;
  connectorPolicies: boolean;
  limits: { apiKeys?: number; deployments?: number; devProjects?: number };
};

const PLAN_CAPABILITIES: Record<BillingPlan, PlanCapabilities> = {
  free: {
    devDepth: "none",
    developmentAccess: false,
    apiAccess: "none",
    apiKeys: "none",
    models: "none",
    deployments: "none",
    localHosting: false,
    onDeviceHosting: false,
    productionServing: false,
    infrastructureManagement: false,
    sharedResources: false,
    logs: "none",
    usage: "none",
    docs: false,
    workSpace: false,
    sharedWorkspaces: false,
    voice: false,
    workspaces: false,
    connectorPolicies: false,
    limits: {},
  },
  pro: {
    devDepth: "build",
    developmentAccess: true,
    apiAccess: "dev",
    apiKeys: "dev",
    models: "explore",
    deployments: "none",
    localHosting: true,
    onDeviceHosting: true,
    productionServing: false,
    infrastructureManagement: false,
    sharedResources: false,
    logs: "limited",
    usage: "limited",
    docs: true,
    workSpace: false,
    sharedWorkspaces: false,
    voice: true,
    workspaces: true,
    connectorPolicies: false,
    limits: { apiKeys: 5, deployments: 3, devProjects: 5 },
  },
  max: {
    devDepth: "collaborate",
    developmentAccess: true,
    apiAccess: "dev",
    apiKeys: "dev",
    models: "shared",
    deployments: "team",
    localHosting: true,
    onDeviceHosting: true,
    productionServing: false,
    infrastructureManagement: false,
    sharedResources: true,
    logs: "limited",
    usage: "limited",
    docs: true,
    workSpace: true,
    sharedWorkspaces: true,
    voice: true,
    workspaces: true,
    connectorPolicies: true,
    limits: { apiKeys: 20, deployments: 10, devProjects: 20 },
  },
  ultra: {
    devDepth: "operate",
    developmentAccess: true,
    apiAccess: "production",
    apiKeys: "production",
    models: "production",
    deployments: "production",
    localHosting: true,
    onDeviceHosting: true,
    productionServing: true,
    infrastructureManagement: true,
    sharedResources: true,
    logs: "full",
    usage: "full",
    docs: true,
    workSpace: true,
    sharedWorkspaces: true,
    voice: true,
    workspaces: true,
    connectorPolicies: true,
    limits: {},
  },
};

export function capabilitiesFor(plan: BillingPlan): PlanCapabilities {
  return PLAN_CAPABILITIES[plan];
}

export function canManageInfrastructure(plan: BillingPlan) {
  return capabilitiesFor(plan).infrastructureManagement;
}

export function devDepthLabel(depth: DevDepth) {
  if (depth === "none") return "None";
  if (depth === "build") return "Build";
  if (depth === "collaborate") return "Collaborate";
  return "Production";
}

export function runtimeLabel(plan: BillingPlan) {
  const { devDepth } = capabilitiesFor(plan);
  if (devDepth === "operate") return "Production";
  if (devDepth === "collaborate") return "Team · integrated";
  if (devDepth === "build") return "Integrated";
  return "Not included";
}

/** Plan permission to choose a compute location. Does not describe hardware. */
export function hostingAllowed(plan: BillingPlan, mode: "cloud" | "local" | "on-device") {
  const caps = capabilitiesFor(plan);
  if (mode === "cloud") return true;
  if (mode === "local") return caps.localHosting;
  return caps.onDeviceHosting;
}

export function hasModelChoice(plan: BillingPlan) {
  const models = capabilitiesFor(plan).models;
  return models === "shared" || models === "production";
}

export function hasWorkSpace(plan: BillingPlan) {
  return capabilitiesFor(plan).workSpace;
}

export function isTeamPlan(plan: BillingPlan) {
  return plan === "max" || plan === "ultra";
}

export function hasWorkspaceKnowledge(plan: BillingPlan) {
  return capabilitiesFor(plan).workspaces;
}

export function hasVoice(plan: BillingPlan) {
  return capabilitiesFor(plan).voice;
}

export function hasWorkspaces(plan: BillingPlan) {
  return capabilitiesFor(plan).workspaces;
}

export function hasConnectorPolicies(plan: BillingPlan) {
  return capabilitiesFor(plan).connectorPolicies;
}

export function workspaceCap(plan: BillingPlan) {
  if (plan === "free") return 0;
  if (plan === "pro") return 3;
  return Infinity;
}

export function nextPlanTier(plan: BillingPlan): BillingPlan | null {
  if (plan === "free") return "pro";
  if (plan === "pro") return "max";
  if (plan === "max") return "ultra";
  return null;
}
