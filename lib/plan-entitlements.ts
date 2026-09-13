import type { BillingPlan } from "./types";
import { canonicalizePlan } from "./billing/plan-catalog.ts";

export type AiCapacity = "standard" | "expanded" | "maximum";

/** Internal plan capabilities — comparison UI uses boolean rows derived from these. */
export type PlanCapabilities = {
  aiCapacity: AiCapacity;
  voice: boolean;
  /** 1 or Infinity — never shown as raw numbers in pricing cells. */
  workspaceLimit: number;
  /** Max connected accounts per app; Infinity = paid multi-account cap in connectors. */
  accountsPerApp: number;
  persistentMemory: boolean;
  advancedMemory: boolean;
  knowledgeBases: boolean;
  sharedWorkspaces: boolean;
  inviteMembers: boolean;
  rolesAndPermissions: boolean;
  sharedWorkspaceKnowledge: boolean;
  organizationControls: boolean;
};

/** Full product access shared by every paid plan (Light+). */
const PAID_FULL_CAPABILITIES: Omit<PlanCapabilities, "aiCapacity"> = {
  voice: true,
  workspaceLimit: Infinity,
  accountsPerApp: Infinity,
  persistentMemory: true,
  advancedMemory: true,
  knowledgeBases: true,
  sharedWorkspaces: true,
  inviteMembers: true,
  rolesAndPermissions: true,
  sharedWorkspaceKnowledge: true,
  organizationControls: true,
};

const PLAN_CAPABILITIES: Record<BillingPlan, PlanCapabilities> = {
  minimal: {
    aiCapacity: "standard",
    voice: false,
    workspaceLimit: 1,
    accountsPerApp: 1,
    persistentMemory: true,
    advancedMemory: false,
    knowledgeBases: false,
    sharedWorkspaces: false,
    inviteMembers: false,
    rolesAndPermissions: false,
    sharedWorkspaceKnowledge: false,
    organizationControls: false,
  },
  light: {
    aiCapacity: "expanded",
    ...PAID_FULL_CAPABILITIES,
  },
  moderate: {
    aiCapacity: "maximum",
    ...PAID_FULL_CAPABILITIES,
  },
  heavy: {
    aiCapacity: "maximum",
    ...PAID_FULL_CAPABILITIES,
  },
  limitless: {
    aiCapacity: "maximum",
    ...PAID_FULL_CAPABILITIES,
  },
};

export function capabilitiesFor(plan: BillingPlan): PlanCapabilities {
  return PLAN_CAPABILITIES[canonicalizePlan(plan)];
}

export function hasExpandedAiCapacity(plan: BillingPlan) {
  const tier = capabilitiesFor(plan).aiCapacity;
  return tier === "expanded" || tier === "maximum";
}

export function hasMaximumAiCapacity(plan: BillingPlan) {
  return capabilitiesFor(plan).aiCapacity === "maximum";
}

export function hasVoice(plan: BillingPlan) {
  return capabilitiesFor(plan).voice;
}

export function workspaceLimit(plan: BillingPlan) {
  return capabilitiesFor(plan).workspaceLimit;
}

export function accountsPerAppLimit(plan: BillingPlan): number {
  return capabilitiesFor(plan).accountsPerApp;
}

export function hasMultipleWorkspaces(plan: BillingPlan) {
  return capabilitiesFor(plan).workspaceLimit > 1;
}

/** Light+ show workspace chrome; Minimal keeps one hidden workspace under the hood. */
export function hasVisibleWorkspaces(plan: BillingPlan) {
  return canonicalizePlan(plan) !== "minimal";
}

export function hasUnlimitedWorkspaces(plan: BillingPlan) {
  return capabilitiesFor(plan).workspaceLimit === Infinity;
}

export function hasKnowledgeBases(plan: BillingPlan) {
  return capabilitiesFor(plan).knowledgeBases;
}

export function hasSharedWorkspaces(plan: BillingPlan) {
  return capabilitiesFor(plan).sharedWorkspaces;
}

export function hasOrganizationControls(plan: BillingPlan) {
  return capabilitiesFor(plan).organizationControls;
}

export function nextPlanTier(plan: BillingPlan): BillingPlan | null {
  const p = canonicalizePlan(plan);
  if (p === "minimal") return "light";
  if (p === "light") return "moderate";
  if (p === "moderate") return "heavy";
  if (p === "heavy") return "limitless";
  return null;
}

type SelfServeCompare = "minimal" | "light" | "moderate" | "heavy";

/** Pricing comparison rows — self-serve plans only in marketing matrix. */
export function planComparisonRows(): {
  label: string;
  values: Record<SelfServeCompare, boolean>;
}[] {
  const all = (values: Record<SelfServeCompare, boolean>) => values;
  return [
    {
      label: "Included AI usage",
      values: all({
        minimal: true,
        light: true,
        moderate: true,
        heavy: true,
      }),
    },
    {
      label: "Unlimited apps",
      values: all({ minimal: true, light: true, moderate: true, heavy: true }),
    },
    {
      label: "Multiple accounts per app",
      values: all({
        minimal: false,
        light: true,
        moderate: true,
        heavy: true,
      }),
    },
    {
      label: "Chat",
      values: all({ minimal: true, light: true, moderate: true, heavy: true }),
    },
    {
      label: "Work",
      values: all({ minimal: true, light: true, moderate: true, heavy: true }),
    },
    {
      label: "Create",
      values: all({ minimal: true, light: true, moderate: true, heavy: true }),
    },
    {
      label: "Explore",
      values: all({ minimal: true, light: true, moderate: true, heavy: true }),
    },
    {
      label: "Apps",
      values: all({ minimal: true, light: true, moderate: true, heavy: true }),
    },
    {
      label: "Pins",
      values: all({ minimal: true, light: true, moderate: true, heavy: true }),
    },
    {
      label: "Recents",
      values: all({ minimal: true, light: true, moderate: true, heavy: true }),
    },
    {
      label: "Workspaces",
      values: all({
        minimal: false,
        light: true,
        moderate: true,
        heavy: true,
      }),
    },
    {
      label: "Shared workspaces",
      values: all({
        minimal: false,
        light: true,
        moderate: true,
        heavy: true,
      }),
    },
    {
      label: "Organizations",
      values: all({
        minimal: false,
        light: true,
        moderate: true,
        heavy: true,
      }),
    },
    {
      label: "Invite members",
      values: all({
        minimal: false,
        light: true,
        moderate: true,
        heavy: true,
      }),
    },
    {
      label: "Roles & permissions",
      values: all({
        minimal: false,
        light: true,
        moderate: true,
        heavy: true,
      }),
    },
    {
      label: "Voice",
      values: all({
        minimal: false,
        light: true,
        moderate: true,
        heavy: true,
      }),
    },
    {
      label: "Persistent memory",
      values: all({ minimal: true, light: true, moderate: true, heavy: true }),
    },
    {
      label: "Advanced memory",
      values: all({
        minimal: false,
        light: true,
        moderate: true,
        heavy: true,
      }),
    },
    {
      label: "Knowledge bases",
      values: all({
        minimal: false,
        light: true,
        moderate: true,
        heavy: true,
      }),
    },
  ];
}
