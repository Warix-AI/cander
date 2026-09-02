/**
 * Connector catalog metadata for the detail modal Information section.
 */

import type { Connector } from "@/lib/types";

export type ConnectorInfoMeta = {
  capabilities: string;
  developer: string;
  category: string;
  version: string;
  websiteUrl?: string;
  privacyPolicyUrl?: string;
  termsUrl?: string;
  dataNotice: string;
};

const DEFAULT_NOTICE =
  "When connected, Cander may use data from this app to answer your requests. The app's use of your data is subject to their terms and privacy policy. You can change skill permissions or disconnect anytime from this connector.";

const CONNECTOR_INFO: Record<string, Partial<ConnectorInfoMeta>> = {
  gmail: {
    capabilities: "Interactive, Write",
    developer: "Google",
    category: "Communication",
    version: "1.0.0",
    websiteUrl: "https://mail.google.com",
    privacyPolicyUrl: "https://policies.google.com/privacy",
    termsUrl: "https://policies.google.com/terms",
    dataNotice:
      "When connected to Gmail, Cander can search, read, draft, and send mail on your behalf according to the skills you enable. Google's use of your data is subject to their terms and privacy policy. You can disconnect or change permissions anytime.",
  },
  slack: {
    capabilities: "Interactive, Write",
    developer: "Slack",
    category: "Communication",
    version: "Preview",
    websiteUrl: "https://slack.com",
    privacyPolicyUrl: "https://slack.com/trust/privacy-policy",
    termsUrl: "https://slack.com/terms-of-service",
  },
  github: {
    capabilities: "Interactive, Read",
    developer: "GitHub",
    category: "Engineering",
    version: "Preview",
    websiteUrl: "https://github.com",
    privacyPolicyUrl: "https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement",
    termsUrl: "https://docs.github.com/en/site-policy/github-terms/github-terms-of-service",
  },
  gcal: {
    capabilities: "Interactive, Write",
    developer: "Google",
    category: "Productivity",
    version: "Preview",
    websiteUrl: "https://calendar.google.com",
    privacyPolicyUrl: "https://policies.google.com/privacy",
    termsUrl: "https://policies.google.com/terms",
  },
  stripe: {
    capabilities: "Read",
    developer: "Stripe",
    category: "Commerce",
    version: "Preview",
    websiteUrl: "https://stripe.com",
    privacyPolicyUrl: "https://stripe.com/privacy",
    termsUrl: "https://stripe.com/legal/ssa",
  },
};

export function connectorInfoFor(item: Connector): ConnectorInfoMeta {
  const override = CONNECTOR_INFO[item.id] ?? {};
  return {
    capabilities: override.capabilities ?? "Read",
    developer: override.developer ?? item.name,
    category: override.category ?? item.category,
    version: override.version ?? "Preview",
    websiteUrl: override.websiteUrl,
    privacyPolicyUrl: override.privacyPolicyUrl,
    termsUrl: override.termsUrl,
    dataNotice: override.dataNotice ?? DEFAULT_NOTICE,
  };
}
