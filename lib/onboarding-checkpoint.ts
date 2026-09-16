import type { BillingPlan } from "@/lib/types";

export type OnboardingCheckpoint = {
  step: string;
  plan: BillingPlan;
  /** @deprecated Kept for resume compatibility with older checkpoints. */
  maxIntent?: "personal" | "org-now" | "org-later" | null;
  orgName?: string;
  orgInvites?: unknown[];
  workspaceName?: string;
  shortName?: string;
  name?: string;
  email?: string;
  selectedConnectors?: string[];
  workspaceId?: string;
};

const CHECKPOINT_KEY = "courier-onboarding-checkpoint";

/** Steps that still exist in the simplified flow. */
const ACTIVE_STEPS = new Set([
  "welcome",
  "sign-in",
  "forgot",
  "create",
  "verify",
  "plan",
  "apps",
]);

/**
 * Map a stored/legacy checkpoint step onto the current AUTH → PLAN → APPS flow.
 * Plan already chosen → apps; otherwise plan (or auth if still pre-session).
 */
export function normalizeOnboardingStep(step: string | null | undefined): string {
  if (!step) return "welcome";
  if (ACTIVE_STEPS.has(step)) return step;
  // Legacy post-plan steps → apps (plan already done if checkpoint has plan).
  if (
    step === "max-intent" ||
    step === "org-setup" ||
    step === "workspace" ||
    step === "appearance" ||
    step === "hosting" ||
    step === "connectors" ||
    step === "profile"
  ) {
    return "apps";
  }
  return "welcome";
}

export function persistOnboardingCheckpoint(checkpoint: OnboardingCheckpoint) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    CHECKPOINT_KEY,
    JSON.stringify({
      ...checkpoint,
      step: normalizeOnboardingStep(checkpoint.step),
    }),
  );
}

export function getOnboardingCheckpointSnapshot(): OnboardingCheckpoint | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CHECKPOINT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnboardingCheckpoint;
    return {
      ...parsed,
      step: normalizeOnboardingStep(parsed.step),
    };
  } catch {
    return null;
  }
}

export function clearOnboardingCheckpoint() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CHECKPOINT_KEY);
}

/** After plan is saved, always continue to Apps. */
export function resumeStepForPlan(_plan: BillingPlan) {
  return "apps";
}
