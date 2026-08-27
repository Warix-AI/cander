"use client";

import type { BillingPlan } from "@/lib/types";

export type OrgInviteDraft = {
  firstName: string;
  lastName: string;
  email: string;
  plan: Extract<BillingPlan, "pro" | "max">;
};

export function emptyOrgInvite(
  plan: OrgInviteDraft["plan"] = "pro",
): OrgInviteDraft {
  return { firstName: "", lastName: "", email: "", plan };
}

export function inviteDisplayName(invite: OrgInviteDraft) {
  const name = [invite.firstName, invite.lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  if (name) return name;
  const local = invite.email.split("@")[0] ?? "";
  return local
    .split(/[._-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const ORG_DEFERRED_KEY = "courier-org-setup-deferred";
const ORG_NAME_KEY = "courier-org-name";
const ORG_INVITES_KEY = "courier-org-invite-draft";

export function persistOrgSetupDeferred(deferred: boolean) {
  if (typeof window === "undefined") return;
  if (deferred) {
    window.localStorage.setItem(ORG_DEFERRED_KEY, "1");
  } else {
    window.localStorage.removeItem(ORG_DEFERRED_KEY);
  }
}

export function getOrgSetupDeferredSnapshot() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ORG_DEFERRED_KEY) === "1";
}

export function persistOrgName(name: string) {
  if (typeof window === "undefined") return;
  const trimmed = name.trim();
  if (trimmed) {
    window.localStorage.setItem(ORG_NAME_KEY, trimmed);
  } else {
    window.localStorage.removeItem(ORG_NAME_KEY);
  }
}

export function getOrgNameSnapshot() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(ORG_NAME_KEY) ?? "";
}

export function persistOrgInviteDraft(invites: OrgInviteDraft[]) {
  if (typeof window === "undefined") return;
  if (!invites.length) {
    window.localStorage.removeItem(ORG_INVITES_KEY);
    return;
  }
  window.localStorage.setItem(ORG_INVITES_KEY, JSON.stringify(invites));
}

export function getOrgInviteDraftSnapshot(): OrgInviteDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ORG_INVITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OrgInviteDraft[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => ({
      firstName: String(row.firstName ?? ""),
      lastName: String(row.lastName ?? ""),
      email: String(row.email ?? ""),
      plan: row.plan === "max" ? "max" : "pro",
    }));
  } catch {
    return [];
  }
}

const ORG_ID_KEY = "courier-org-id";

export function persistOrgId(orgId: string) {
  if (typeof window === "undefined") return;
  if (orgId.trim()) {
    window.localStorage.setItem(ORG_ID_KEY, orgId.trim());
  } else {
    window.localStorage.removeItem(ORG_ID_KEY);
  }
}

export function getOrgIdSnapshot() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(ORG_ID_KEY) ?? "";
}

export function clearOrgOnboardingDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ORG_DEFERRED_KEY);
  window.localStorage.removeItem(ORG_NAME_KEY);
  window.localStorage.removeItem(ORG_INVITES_KEY);
  window.localStorage.removeItem(ORG_ID_KEY);
}
