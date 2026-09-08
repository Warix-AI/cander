/**
 * Project custom domain lifecycle (Phase 10).
 * Server-only. Callers must assertProjectAccess.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureAppVercelProject } from "@/lib/build/vercel/projects";
import {
  defaultCustomDomainDnsHint,
  ensureCustomDomainOnVercelProject,
  getProjectDomain,
  removeProjectDomain,
  type VercelDomainConfig,
} from "@/lib/build/vercel/domains";
import { isAllowedCustomDomainHost } from "@/lib/build/publish/published-url";
import { normalizeCustomDomain } from "@/lib/publish-domain";
import { vercelApiConfigured } from "@/lib/build/vercel/api";

export type CustomDomainStatus = "pending" | "verified" | "error" | "none";

export type ProjectDomainState = {
  domain: string | null;
  status: CustomDomainStatus;
  verified: boolean;
  verification: VercelDomainConfig["verification"];
  dnsHint: { type: string; name: string; value: string } | null;
  message?: string;
};

export async function getProjectCustomDomain(opts: {
  projectId: string;
  workspaceId: string;
}): Promise<ProjectDomainState> {
  const admin = createSupabaseAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select(
      "custom_domain, custom_domain_status, custom_domain_verification, vercel_project_id",
    )
    .eq("id", opts.projectId)
    .eq("workspace_id", opts.workspaceId)
    .maybeSingle();

  if (!project?.custom_domain) {
    return {
      domain: null,
      status: "none",
      verified: false,
      verification: undefined,
      dnsHint: null,
    };
  }

  const domain = String(project.custom_domain);
  let status = (project.custom_domain_status as CustomDomainStatus) || "pending";
  let verification =
    (project.custom_domain_verification as VercelDomainConfig["verification"]) ||
    undefined;

  // Refresh from Vercel when possible.
  if (vercelApiConfigured() && project.vercel_project_id) {
    try {
      const remote = await getProjectDomain({
        vercelProjectId: String(project.vercel_project_id),
        domain,
      });
      if (remote) {
        status = remote.verified ? "verified" : "pending";
        verification = remote.verification;
        await admin
          .from("projects")
          .update({
            custom_domain_status: status,
            custom_domain_verification: verification ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", opts.projectId)
          .eq("workspace_id", opts.workspaceId);
      }
    } catch (err) {
      console.warn("[cander] domain status refresh", err);
    }
  }

  return {
    domain,
    status,
    verified: status === "verified",
    verification,
    dnsHint: defaultCustomDomainDnsHint(domain),
  };
}

export async function attachProjectCustomDomain(opts: {
  projectId: string;
  workspaceId: string;
  domain: string;
}): Promise<ProjectDomainState> {
  if (!vercelApiConfigured()) {
    throw new Error("VERCEL_TOKEN is required to attach custom domains.");
  }
  const domain = normalizeCustomDomain(opts.domain);
  if (!isAllowedCustomDomainHost(domain)) {
    throw new Error(
      "Enter a valid custom domain (not *.cander.app or *.vercel.app).",
    );
  }

  const admin = createSupabaseAdminClient();

  // Uniqueness across projects
  const { data: taken } = await admin
    .from("projects")
    .select("id")
    .eq("custom_domain", domain)
    .neq("id", opts.projectId)
    .maybeSingle();
  if (taken) {
    throw new Error("That domain is already used by another project.");
  }

  const vercelProject = await ensureAppVercelProject({
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
  });

  const remote = await ensureCustomDomainOnVercelProject({
    vercelProjectId: vercelProject.vercelProjectId,
    domain,
  });

  const status: CustomDomainStatus = remote.verified ? "verified" : "pending";
  const now = new Date().toISOString();

  await admin
    .from("projects")
    .update({
      custom_domain: domain,
      custom_domain_status: status,
      custom_domain_verification: remote.verification ?? null,
      updated_at: now,
    })
    .eq("id", opts.projectId)
    .eq("workspace_id", opts.workspaceId);

  // Keep domains[] in sync for UI lists (best-effort).
  try {
    const { data: row } = await admin
      .from("projects")
      .select("domains")
      .eq("id", opts.projectId)
      .maybeSingle();
    const list = Array.isArray(row?.domains)
      ? (row!.domains as string[]).map(normalizeCustomDomain)
      : [];
    if (!list.includes(domain)) {
      await admin
        .from("projects")
        .update({ domains: [...list, domain], updated_at: now })
        .eq("id", opts.projectId);
    }
  } catch {
    /* domains column optional */
  }

  return {
    domain,
    status,
    verified: status === "verified",
    verification: remote.verification,
    dnsHint: defaultCustomDomainDnsHint(domain),
    message: remote.verified
      ? "Domain verified."
      : "Domain attached — finish DNS, then refresh verification.",
  };
}

export async function detachProjectCustomDomain(opts: {
  projectId: string;
  workspaceId: string;
  domain?: string;
}): Promise<ProjectDomainState> {
  const admin = createSupabaseAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("custom_domain, vercel_project_id, domains")
    .eq("id", opts.projectId)
    .eq("workspace_id", opts.workspaceId)
    .maybeSingle();

  const domain = normalizeCustomDomain(
    opts.domain || (project?.custom_domain ? String(project.custom_domain) : ""),
  );
  if (!domain) {
    return {
      domain: null,
      status: "none",
      verified: false,
      verification: undefined,
      dnsHint: null,
    };
  }

  if (vercelApiConfigured() && project?.vercel_project_id) {
    try {
      await removeProjectDomain({
        vercelProjectId: String(project.vercel_project_id),
        domain,
      });
    } catch (err) {
      console.warn("[cander] vercel domain remove", err);
    }
  }

  const now = new Date().toISOString();
  const clearPrimary =
    !project?.custom_domain ||
    normalizeCustomDomain(String(project.custom_domain)) === domain;

  const patch: Record<string, unknown> = { updated_at: now };
  if (clearPrimary) {
    patch.custom_domain = null;
    patch.custom_domain_status = null;
    patch.custom_domain_verification = null;
  }
  if (Array.isArray(project?.domains)) {
    patch.domains = (project!.domains as string[]).filter(
      (d) => normalizeCustomDomain(d) !== domain,
    );
  }

  await admin
    .from("projects")
    .update(patch)
    .eq("id", opts.projectId)
    .eq("workspace_id", opts.workspaceId);

  return {
    domain: null,
    status: "none",
    verified: false,
    verification: undefined,
    dnsHint: null,
    message: "Domain removed.",
  };
}
