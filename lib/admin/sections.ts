/** Admin navigation sections + shared types. */

export const ADMIN_SECTIONS = [
  "overview",
  "plans",
  "pricing",
  "accounts",
  "usage",
  "subscriptions",
  "enterprise",
  "audit",
  "operations",
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];

export function isAdminSection(value: string | null | undefined): value is AdminSection {
  return Boolean(value && (ADMIN_SECTIONS as readonly string[]).includes(value));
}

export const ADMIN_SECTION_LABELS: Record<AdminSection, string> = {
  overview: "Overview",
  plans: "Plans",
  pricing: "Pricing",
  accounts: "Accounts",
  usage: "Usage",
  subscriptions: "Subscriptions",
  enterprise: "Enterprise",
  audit: "Audit",
  operations: "Operations",
};
