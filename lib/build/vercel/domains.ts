/**
 * Vercel Domains API helpers (Phase 10).
 * Server-only. Attach customer domains to Warix-team projects.
 */

import { vercelFetch } from "@/lib/build/vercel/api";
import { isAllowedCustomDomainHost } from "@/lib/build/publish/published-url";
import { normalizeCustomDomain } from "@/lib/publish-domain";

export type VercelDomainConfig = {
  name: string;
  verified: boolean;
  verification?: Array<{
    type: string;
    domain: string;
    value: string;
    reason?: string;
  }>;
  cnames?: string[];
  aValues?: string[];
  misconfigured?: boolean;
};

export async function ensureCustomDomainOnVercelProject(opts: {
  vercelProjectId: string;
  domain: string;
}): Promise<VercelDomainConfig> {
  const domain = normalizeCustomDomain(opts.domain);
  if (!isAllowedCustomDomainHost(domain)) {
    throw new Error("That domain is not allowed.");
  }

  const existing = await getProjectDomain({
    vercelProjectId: opts.vercelProjectId,
    domain,
  });
  if (existing) return existing;

  const res = await vercelFetch(
    `/v10/projects/${encodeURIComponent(opts.vercelProjectId)}/domains`,
    {
      method: "POST",
      body: JSON.stringify({ name: domain }),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Could not attach domain on Vercel: ${detail}`);
  }
  const body = (await res.json()) as {
    name?: string;
    verified?: boolean;
    verification?: VercelDomainConfig["verification"];
  };
  return {
    name: body.name || domain,
    verified: Boolean(body.verified),
    verification: body.verification,
  };
}

export async function getProjectDomain(opts: {
  vercelProjectId: string;
  domain: string;
}): Promise<VercelDomainConfig | null> {
  const domain = normalizeCustomDomain(opts.domain);
  const res = await vercelFetch(
    `/v9/projects/${encodeURIComponent(opts.vercelProjectId)}/domains/${encodeURIComponent(domain)}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Could not read domain: ${detail}`);
  }
  const body = (await res.json()) as {
    name?: string;
    verified?: boolean;
    verification?: VercelDomainConfig["verification"];
  };
  return {
    name: body.name || domain,
    verified: Boolean(body.verified),
    verification: body.verification,
  };
}

export async function removeProjectDomain(opts: {
  vercelProjectId: string;
  domain: string;
}): Promise<void> {
  const domain = normalizeCustomDomain(opts.domain);
  const res = await vercelFetch(
    `/v9/projects/${encodeURIComponent(opts.vercelProjectId)}/domains/${encodeURIComponent(domain)}`,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 404) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Could not remove domain: ${detail}`);
  }
}

/** DNS instructions for the Domains UI (CNAME → cname.vercel-dns.com is common). */
export function defaultCustomDomainDnsHint(domain: string): {
  type: string;
  name: string;
  value: string;
} {
  const host = normalizeCustomDomain(domain);
  const isApex = host.split(".").length === 2;
  if (isApex) {
    return {
      type: "A",
      name: "@",
      value: "76.76.21.21",
    };
  }
  return {
    type: "CNAME",
    name: host.split(".")[0] || "www",
    value: "cname.vercel-dns.com",
  };
}
