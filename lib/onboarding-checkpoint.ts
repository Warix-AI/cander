import type { BillingPlan } from "@/lib/types";

export type OnboardingCheckpoint = {
  step: string;
  plan: BillingPlan;
  maxIntent?: "personal" | "org-now" | "org-later" | null;
  orgName?: string;
  orgInvites?: unknown[];
  workspaceName?: string;
  shortName?: string;
  name?: string;
  email?: string;
  selectedConnectors?: string[];
};

const CHECKPOINT_KEY = "courier-onboarding-checkpoint";

export function persistOnboardingCheckpoint(checkpoint: OnboardingCheckpoint) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(checkpoint));
}

export function getOnboardingCheckpointSnapshot(): OnboardingCheckpoint | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CHECKPOINT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OnboardingCheckpoint;
  } catch {
    return null;
  }
}

export function clearOnboardingCheckpoint() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CHECKPOINT_KEY);
}

export function resumeStepForPlan(plan: BillingPlan) {
  if (plan === "max") return "max-intent";
  if (plan === "pro") return "workspace";
  return "connectors";
}
