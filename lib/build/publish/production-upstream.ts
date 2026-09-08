/**
 * Resolve production upstream for public *.cander.app hosts (Phase 8).
 * Server-only. No auth — published apps are public.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAllowedProductionUpstreamOrigin } from "@/lib/build/preview/urls";
import { vercelApiConfigured, vercelFetch } from "@/lib/build/vercel/api";

export type ResolvedProductionUpstream = {
  projectId: string;
  workspaceId: string;
  subdomain: string;
  publishedSha: string | null;
  upstreamOrigin: string;
};

function originFromUrl(raw: string): string | null {
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

async function fetchVercelDeploymentOrigin(
  deploymentId: string,
): Promise<string | null> {
  if (!vercelApiConfigured()) return null;
  try {
    const res = await vercelFetch(
      `/v13/deployments/${encodeURIComponent(deploymentId)}`,
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { url?: string };
    if (!body.url) return null;
    const raw = body.url.startsWith("http")
      ? body.url
      : `https://${body.url}`;
    return originFromUrl(raw);
  } catch {
    return null;
  }
}

/**
 * Look up published project by cander_subdomain and pin a Vercel upstream origin.
 */
export async function resolveProductionUpstreamBySubdomain(
  subdomain: string,
): Promise<ResolvedProductionUpstream | null> {
  const slug = subdomain.trim().toLowerCase();
  if (!slug) return null;

  const admin = createSupabaseAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select(
      "id, workspace_id, cander_subdomain, published_sha, published_url, status, vercel_production_url, vercel_production_deployment_id",
    )
    .eq("cander_subdomain", slug)
    .maybeSingle();

  if (!project) return null;
  if (project.status && String(project.status) !== "published") {
    // Still allow if we have a published_sha (status drift)
    if (!project.published_sha) return null;
  }
  if (!project.published_sha && !project.vercel_production_deployment_id) {
    return null;
  }

  let origin: string | null = null;

  if (project.vercel_production_url) {
    origin = originFromUrl(String(project.vercel_production_url));
  }

  if (!origin && project.vercel_production_deployment_id) {
    origin = await fetchVercelDeploymentOrigin(
      String(project.vercel_production_deployment_id),
    );
    if (origin) {
      // Best-effort backfill so later requests stay pinned.
      try {
        await admin
          .from("projects")
          .update({
            vercel_production_url: origin,
            updated_at: new Date().toISOString(),
          })
          .eq("id", project.id);
      } catch {
        /* optional */
      }
    }
  }

  // Never treat published_url as upstream if it is *.cander.app (would loop).
  if (!origin && project.published_url) {
    const candidate = originFromUrl(String(project.published_url));
    if (candidate && isAllowedProductionUpstreamOrigin(candidate)) {
      origin = candidate;
    }
  }

  if (!origin || !isAllowedProductionUpstreamOrigin(origin)) {
    console.warn(
      "[cander] rejected or missing production upstream",
      slug,
      origin,
    );
    return null;
  }

  return {
    projectId: String(project.id),
    workspaceId: String(project.workspace_id),
    subdomain: slug,
    publishedSha: project.published_sha ? String(project.published_sha) : null,
    upstreamOrigin: origin,
  };
}
