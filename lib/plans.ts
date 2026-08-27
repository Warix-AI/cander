import { APP_DOMAIN } from "@/lib/app-brand";
import type { BillingPlan } from "@/lib/types";

export const BILLING_PLANS: BillingPlan[] = ["free", "pro", "max"];

/** Map legacy DB / demo values to the active plan set. */
export function normalizePlan(value: unknown): BillingPlan {
  if (value === "pro" || value === "max") return value;
  if (value === "ultra") return "max";
  return "free";
}

export function isPaidPlan(plan: BillingPlan) {
  return plan === "pro" || plan === "max";
}

export function isTeamPlan(plan: BillingPlan) {
  return plan === "max";
}

/** Web billing page — upgrades happen outside the iOS app (no IAP). */
export function subscriptionManageUrl(origin?: string) {
  const base =
    origin ??
    (typeof window !== "undefined"
      ? window.location.origin
      : `https://${APP_DOMAIN}`);
  return `${base}/pricing`;
}

/** Open Organization settings on the web (native app seat management). */
export function webAppOrgSettingsUrl(origin?: string) {
  const base =
    origin ??
    (typeof window !== "undefined"
      ? window.location.origin
      : `https://${APP_DOMAIN}`);
  return `${base}/?settings=organization`;
}

/** Open Plan & billing settings on the web (native app cancel / upgrade). */
export function webAppPlansSettingsUrl(origin?: string) {
  const base =
    origin ??
    (typeof window !== "undefined"
      ? window.location.origin
      : `https://${APP_DOMAIN}`);
  return `${base}/?settings=plans`;
}
