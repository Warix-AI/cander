import { APP_DOMAIN } from "@/lib/app-brand";
import {
  SELF_SERVE_PLANS,
  canonicalizePlan,
  isSelfServePlan,
  planDisplayName,
} from "@/lib/billing/plan-catalog";
import type { BillingPlan } from "@/lib/types";

/** Self-serve plans (checkout / marketing cards excluding Limitless). */
export const BILLING_PLANS = SELF_SERVE_PLANS;

export type SelfServePlan = (typeof BILLING_PLANS)[number];

/** All plans including Limitless (contracts / admin). */
export const ALL_BILLING_PLANS: BillingPlan[] = [
  "minimal",
  "light",
  "moderate",
  "heavy",
  "limitless",
];

/** Map legacy DB / demo values and canonical ids to the active plan set. */
export function normalizePlan(value: unknown): BillingPlan {
  return canonicalizePlan(value);
}

export function isPaidPlan(plan: BillingPlan) {
  const p = normalizePlan(plan);
  return p !== "minimal";
}

/** Team / org features — Light and above (all paid plans). */
export function isTeamPlan(plan: BillingPlan) {
  return isPaidPlan(plan);
}

export function isEnterprisePlan(plan: BillingPlan) {
  return normalizePlan(plan) === "limitless";
}

export function isLimitlessPlan(plan: BillingPlan) {
  return normalizePlan(plan) === "limitless";
}

export { isSelfServePlan, planDisplayName };

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
